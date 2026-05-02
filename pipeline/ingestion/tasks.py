"""
pipeline/ingestion/tasks.py
────────────────────────────
Celery task definitions for the ingestion pipeline.

Workers pick up records from the queue, pass them through the
parsing layer, entity resolution, and write to the database.

Task graph:
  ingest_record         ← primary worker: parse + resolve + store
  run_connector         ← trigger a connector fetch and push to queue
  fetch_document        ← download and parse a filing PDF
  enrich_company        ← run enrichment for a resolved company
  detect_changes        ← compare new snapshot with stored state
  sync_to_firestore     ← write pipeline data back to the CRM's Firestore

All tasks are idempotent — safe to retry on failure.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from celery import Celery
from celery.utils.log import get_task_logger

from pipeline.config import config as cfg_module
from pipeline.connectors.base import RawRecord
from pipeline.db.database import get_session
from pipeline.entity_resolution.resolver import EntityResolver
from pipeline.monitoring.audit_log import AuditLog
from pipeline.parsing.pdf_parser import PDFParser
from pipeline.parsing.html_parser import HTMLParser

logger = get_task_logger(__name__)

# ─── Celery app ───────────────────────────────────────────────────────────────

_ing_cfg  = cfg_module.get("ingestion")
_redis_url = _ing_cfg.get("redis_url", "redis://localhost:6379/0")

celery_app = Celery(
    "pipeline",
    broker   = _redis_url,
    backend  = _redis_url,
)

celery_app.conf.update(
    task_serializer         = "json",
    result_serializer       = "json",
    accept_content          = ["json"],
    timezone                = "UTC",
    enable_utc              = True,
    task_track_started      = True,
    task_acks_late          = True,    # only ack after successful completion
    worker_prefetch_multiplier = 1,    # one task at a time per worker (safe for I/O tasks)
    task_routes = {
        "pipeline.ingestion.tasks.ingest_record":    {"queue": "pipeline:default"},
        "pipeline.ingestion.tasks.run_connector":    {"queue": "pipeline:default"},
        "pipeline.ingestion.tasks.fetch_document":   {"queue": "pipeline:high"},
        "pipeline.ingestion.tasks.enrich_company":   {"queue": "pipeline:bulk"},
        "pipeline.ingestion.tasks.detect_changes":   {"queue": "pipeline:bulk"},
        "pipeline.ingestion.tasks.sync_to_firestore": {"queue": "pipeline:bulk"},
    },
    beat_schedule = {
        "bundesanzeiger-daily": {
            "task":     "pipeline.ingestion.tasks.run_connector",
            "schedule": _parse_cron(
                _ing_cfg.get("schedules", {})
                        .get("bundesanzeiger_daily", {})
                        .get("cron", "0 2 * * *")
            ),
            "kwargs": {"source": "bundesanzeiger", "job": "new_filings"},
        },
        "unternehmensregister-weekly": {
            "task":     "pipeline.ingestion.tasks.run_connector",
            "schedule": _parse_cron(
                _ing_cfg.get("schedules", {})
                        .get("unternehmensregister_weekly", {})
                        .get("cron", "0 3 * * 0")
            ),
            "kwargs": {"source": "unternehmensregister", "job": "incremental_sync"},
        },
        "change-detection": {
            "task":     "pipeline.ingestion.tasks.detect_changes",
            "schedule": _parse_cron(
                _ing_cfg.get("schedules", {})
                        .get("change_detection", {})
                        .get("cron", "0 */6 * * *")
            ),
            "kwargs": {},
        },
    },
)


def _parse_cron(cron_str: str):
    """Convert crontab string to celery crontab object."""
    from celery.schedules import crontab
    parts = cron_str.split()
    if len(parts) != 5:
        return crontab()
    minute, hour, dom, month, dow = parts
    return crontab(
        minute=minute, hour=hour,
        day_of_month=dom, month_of_year=month, day_of_week=dow,
    )


# ─── Core ingestion task ──────────────────────────────────────────────────────

@celery_app.task(
    name="pipeline.ingestion.tasks.ingest_record",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def ingest_record(self, raw_record_dict: dict) -> dict:
    """
    Process a single raw record through the full pipeline:
      1. Parse structured data from raw HTML / PDF / JSON
      2. Resolve entity (canonical company_id)
      3. Upsert to pipeline database
      4. Trigger enrichment if company passes acquisition filters
      5. Queue Firestore sync

    Args:
        raw_record_dict: RawRecord.to_dict() payload

    Returns:
        {"status": "ok"|"skipped"|"error", "company_id": ..., ...}
    """
    source      = raw_record_dict.get("source", "unknown")
    record_type = raw_record_dict.get("type", "unknown")
    logger.info("[ingest] Processing %s/%s", source, record_type)

    try:
        raw_data = raw_record_dict.get("raw_data", {})

        # ── 1. Parse / normalise ────────────────────────────────────────────
        if record_type == "filing":
            parsed = _parse_filing(raw_data, source)
        elif record_type == "company":
            parsed = _parse_company(raw_data, source)
        else:
            parsed = raw_data

        if not parsed:
            logger.warning("[ingest] Parser returned empty result — skipping")
            return {"status": "skipped", "reason": "empty_parse"}

        # ── 2. Entity resolution ────────────────────────────────────────────
        with get_session() as session:
            resolver = EntityResolver(session)
            company_id, is_new = resolver.resolve(parsed)

        logger.info("[ingest] Resolved → company_id=%s (new=%s)", company_id, is_new)

        # ── 3. Persist raw + parsed ─────────────────────────────────────────
        with get_session() as session:
            _upsert_record(session, raw_record_dict, parsed, company_id)

        # ── 4. Enrich if this is a new or updated company ──────────────────
        if is_new or _should_enrich(parsed):
            enrich_company.apply_async(kwargs={"company_id": company_id}, countdown=5)

        # ── 5. Sync to Firestore ────────────────────────────────────────────
        _fs_cfg = cfg_module.get("firestore")
        if _fs_cfg.get("sync_enabled"):
            sync_to_firestore.apply_async(kwargs={"company_id": company_id}, countdown=10)

        return {"status": "ok", "company_id": company_id, "is_new": is_new}

    except Exception as exc:
        logger.error("[ingest] Error: %s", exc, exc_info=True)
        raise self.retry(exc=exc)


# ─── Connector runner ─────────────────────────────────────────────────────────

@celery_app.task(
    name="pipeline.ingestion.tasks.run_connector",
    bind=True,
    max_retries=2,
)
def run_connector(self, source: str, job: str, **kwargs) -> dict:
    """
    Trigger a connector fetch and push results to the ingestion queue.
    This is the entry point for scheduled jobs.
    """
    import asyncio
    from pipeline.ingestion.queue import create_queue
    from pipeline.config import config as cfg_module

    logger.info("[connector] Starting %s / %s", source, job)

    try:
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            _run_connector_async(source, job, **kwargs)
        )
        loop.close()
        return result
    except Exception as exc:
        logger.error("[connector] %s/%s failed: %s", source, job, exc)
        raise self.retry(exc=exc)


async def _run_connector_async(source: str, job: str, **kwargs) -> dict:
    """Async body for run_connector — instantiates connector and fetches."""
    from pipeline.config import config as cfg_module
    from pipeline.ingestion.queue import create_queue
    from pipeline.connectors.bundesanzeiger import BundesanzeigerConnector
    from pipeline.connectors.unternehmensregister import UnternehmensregisterConnector
    from pipeline.connectors.handelsregister import HandelsregisterConnector

    ing_cfg  = cfg_module.get("ingestion")
    queue    = create_queue(ing_cfg)

    src_cfg  = cfg_module.get("data_sources", source) or {}

    connector_map = {
        "bundesanzeiger":       BundesanzeigerConnector,
        "unternehmensregister": UnternehmensregisterConnector,
        "handelsregister":      HandelsregisterConnector,
    }

    cls = connector_map.get(source)
    if not cls:
        raise ValueError(f"Unknown source: {source}")

    connector = cls(src_cfg, queue=queue)

    try:
        if job == "new_filings":
            records = await connector.fetch_new_filings(since=_last_run_time(source))
        elif job == "incremental_sync":
            records = await connector.incremental_sync(since=_last_run_time(source))
        else:
            records = await connector.fetch(**kwargs)

        pushed = await connector.push_to_queue(records)

        # Dispatch an ingest task per record
        for rec in records:
            ingest_record.apply_async(args=[rec.to_dict()])

        _update_last_run_time(source)
        return {"source": source, "fetched": len(records), "pushed": pushed}

    finally:
        await connector.close()


# ─── Document fetch task ──────────────────────────────────────────────────────

@celery_app.task(
    name="pipeline.ingestion.tasks.fetch_document",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def fetch_document(self, company_id: str, document_url: str, document_type: str) -> dict:
    """
    Download and parse a filing document (PDF or HTML) for a specific company.
    Only triggered when the company passes acquisition filters.
    Cost is tracked in the retrieval_cost table.
    """
    import asyncio
    from pipeline.retrieval.document_retriever import DocumentRetriever
    from pipeline.retrieval.cost_tracker import CostTracker

    logger.info("[doc] Fetching %s for company %s", document_type, company_id)

    try:
        retriever = DocumentRetriever(cfg_module.get("retrieval"))
        tracker   = CostTracker(cfg_module.get("retrieval"))

        # Check budget before fetching
        monthly_budget = cfg_module.get("retrieval", "monthly_budget_eur") or 500.0
        if not tracker.can_afford(monthly_budget):
            logger.warning("[doc] Monthly budget exhausted — skipping document fetch")
            return {"status": "budget_exhausted", "company_id": company_id}

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            retriever.fetch(document_url, document_type)
        )
        loop.close()

        if result:
            # Parse and store
            with get_session() as session:
                _store_document(session, company_id, result, document_type)
            tracker.record(result.get("cost_eur", 0.0), company_id, document_type)

        return {"status": "ok", "company_id": company_id, "pages": result.get("pages", 0)}

    except Exception as exc:
        logger.error("[doc] Fetch failed for %s: %s", company_id, exc)
        raise self.retry(exc=exc)


# ─── Enrichment task ──────────────────────────────────────────────────────────

@celery_app.task(
    name="pipeline.ingestion.tasks.enrich_company",
    bind=True,
    max_retries=2,
)
def enrich_company(self, company_id: str) -> dict:
    """
    Run the full enrichment suite for a resolved company:
    director graph, ownership tree, industry classification.
    """
    from pipeline.enrichment.director_graph import DirectorGraph
    from pipeline.enrichment.ownership_tree import OwnershipTree
    from pipeline.enrichment.industry_classifier import IndustryClassifier

    logger.info("[enrich] company_id=%s", company_id)

    try:
        with get_session() as session:
            enrich_cfg = cfg_module.get("enrichment")

            if enrich_cfg.get("director_graph", {}).get("enabled", True):
                graph = DirectorGraph(session)
                graph.build_for_company(company_id)

            if enrich_cfg.get("ownership_tree", {}).get("enabled", True):
                tree = OwnershipTree(session)
                tree.build_for_company(company_id)

            if enrich_cfg.get("industry_classification", {}).get("enabled", True):
                clf = IndustryClassifier(session)
                clf.classify_company(company_id)

        return {"status": "ok", "company_id": company_id}

    except Exception as exc:
        logger.error("[enrich] Error for %s: %s", company_id, exc)
        raise self.retry(exc=exc)


# ─── Change detection task ────────────────────────────────────────────────────

@celery_app.task(
    name="pipeline.ingestion.tasks.detect_changes",
    bind=True,
)
def detect_changes(self) -> dict:
    """
    Sweep all tracked companies and emit change events when
    directors, ownership, or status differ from stored baseline.
    """
    from pipeline.monitoring.change_detector import ChangeDetector

    logger.info("[monitor] Running change detection sweep")

    with get_session() as session:
        detector = ChangeDetector(session)
        changes  = detector.run_sweep()

    logger.info("[monitor] Detected %d changes", len(changes))
    return {"status": "ok", "changes": len(changes)}


# ─── Firestore sync task ───────────────────────────────────────────────────────

@celery_app.task(
    name="pipeline.ingestion.tasks.sync_to_firestore",
    bind=True,
    max_retries=3,
)
def sync_to_firestore(self, company_id: str) -> dict:
    """
    Write enriched pipeline data back to the CRM's Firestore.
    Only syncs companies that pass acquisition filters.
    """
    from pipeline.db.firestore_writer import FirestoreWriter

    logger.info("[sync] Syncing company_id=%s to Firestore", company_id)

    try:
        fs_cfg = cfg_module.get("firestore")
        writer = FirestoreWriter(fs_cfg)

        with get_session() as session:
            count = writer.sync_company(session, company_id)

        return {"status": "ok", "company_id": company_id, "records": count}

    except Exception as exc:
        logger.error("[sync] Firestore sync failed for %s: %s", company_id, exc)
        raise self.retry(exc=exc)


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _parse_filing(raw_data: dict, source: str) -> dict:
    """Normalise raw filing data into the canonical schema."""
    return {
        "company_name":    raw_data.get("company_name", ""),
        "registry_number": raw_data.get("registry_no", raw_data.get("registry_number", "")),
        "filing_type":     raw_data.get("filing_type", "other"),
        "filing_date":     raw_data.get("pub_date", ""),
        "document_url":    raw_data.get("detail_url", ""),
        "source":          source,
    }


def _parse_company(raw_data: dict, source: str) -> dict:
    """Normalise raw company data into the canonical schema."""
    addr = raw_data.get("address", {})
    return {
        "company_name":    raw_data.get("company_name", ""),
        "registry_number": raw_data.get("registry_number", ""),
        "legal_form":      raw_data.get("legal_form", ""),
        "court":           raw_data.get("court", ""),
        "status":          raw_data.get("status", "unknown"),
        "postal_code":     addr.get("postal_code", "") if isinstance(addr, dict) else "",
        "city":            addr.get("city", "") if isinstance(addr, dict) else "",
        "source":          source,
    }


def _upsert_record(session, raw_record: dict, parsed: dict, company_id: str) -> None:
    """Persist raw + parsed data to pipeline DB."""
    from pipeline.db.models import CompanySource, RawIngestion
    import json as _json

    # Store raw ingestion log
    raw_entry = RawIngestion(
        source        = raw_record.get("source", ""),
        record_type   = raw_record.get("type", ""),
        source_url    = raw_record.get("source_url", ""),
        source_id     = raw_record.get("source_id", ""),
        raw_json      = _json.dumps(raw_record.get("raw_data", {})),
        company_id    = company_id,
    )
    session.merge(raw_entry)

    # Upsert into company_sources
    cs = CompanySource(
        company_id     = company_id,
        source         = raw_record.get("source", ""),
        source_id      = raw_record.get("source_id", ""),
        company_name   = parsed.get("company_name", ""),
        registry_number= parsed.get("registry_number", ""),
        legal_form     = parsed.get("legal_form", ""),
        status         = parsed.get("status", "unknown"),
        raw_json       = _json.dumps(raw_record.get("raw_data", {})),
    )
    session.merge(cs)
    session.commit()


def _should_enrich(parsed: dict) -> bool:
    """Return True if this company warrants enrichment."""
    lf = parsed.get("legal_form", "")
    return lf in {"GmbH", "GmbH & Co. KG", "AG", "e.K.", "KG"}


def _last_run_time(source: str) -> datetime | None:
    """Read the last successful run time for this source from the DB."""
    try:
        with get_session() as session:
            from pipeline.db.models import ConnectorState
            state = session.get(ConnectorState, source)
            if state and state.last_run_at:
                return state.last_run_at
    except Exception:
        pass
    return None


def _update_last_run_time(source: str) -> None:
    """Persist the current time as the last run for this source."""
    try:
        with get_session() as session:
            from pipeline.db.models import ConnectorState
            state = ConnectorState(source=source, last_run_at=datetime.now(timezone.utc))
            session.merge(state)
            session.commit()
    except Exception as exc:
        logger.warning("Could not update last_run_time for %s: %s", source, exc)


def _store_document(session, company_id: str, result: dict, doc_type: str) -> None:
    """Persist a fetched document and its parsed output."""
    from pipeline.db.models import Document
    import json as _json

    doc = Document(
        company_id   = company_id,
        document_type= doc_type,
        source_url   = result.get("url", ""),
        file_path    = result.get("file_path", ""),
        pages        = result.get("pages", 0),
        parsed_json  = _json.dumps(result.get("parsed", {})),
        fetched_at   = datetime.now(timezone.utc),
    )
    session.add(doc)
    session.commit()
