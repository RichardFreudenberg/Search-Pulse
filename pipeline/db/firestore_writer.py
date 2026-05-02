"""
pipeline/db/firestore_writer.py
────────────────────────────────
Writes enriched pipeline data back to the CRM's Firebase Firestore.

This is the bridge between the Python pipeline DB (PostgreSQL) and the
existing JavaScript CRM (Firebase).  It is strictly additive:
  • Only CREATES or MERGES documents — never deletes CRM data
  • Uses the same collection paths as the existing frontend
  • Adds pipeline-specific fields under a "_pipeline" namespace so
    the frontend can distinguish its own data from enriched pipeline data

Firestore writes use the Admin SDK with a service account —
set FIREBASE_CREDENTIALS_PATH in your environment.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class FirestoreWriter:
    """
    Writes canonical company data to the CRM's Firestore.

    The writer respects:
      • sync_filter_enabled — only sync acquisition-grade companies
      • batch_size          — Firestore batch write limit (max 500)
    """

    def __init__(self, cfg: dict) -> None:
        self._cfg          = cfg
        self._project_id   = cfg.get("project_id", "")
        self._creds_path   = cfg.get("credentials_path", "")
        self._collections  = cfg.get("collections", {
            "companies": "companies",
            "directors": "directors",
            "filings":   "filings",
        })
        self._batch_size   = int(cfg.get("batch_size", 500))
        self._filter_enabled = cfg.get("sync_filter_enabled", True)
        self._db: Any = None

    def _get_db(self):
        """Lazy-initialise Firestore Admin SDK client."""
        if self._db is not None:
            return self._db

        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError:
            raise RuntimeError(
                "firebase-admin not installed — run: pip install firebase-admin"
            )

        if not firebase_admin._apps:
            if self._creds_path:
                cred = credentials.Certificate(self._creds_path)
            else:
                # Try application default credentials (GCP / Cloud Run)
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                "projectId": self._project_id,
            })

        self._db = firestore.client()
        return self._db

    # ── Public interface ──────────────────────────────────────────────────────

    def sync_company(self, session, company_id: str) -> int:
        """
        Sync a single company (and its directors/filings) to Firestore.
        Returns number of documents written.
        """
        from pipeline.db.models import CanonicalCompany, Filing, DirectorRole

        company = session.get(CanonicalCompany, company_id)
        if not company:
            logger.warning("[firestore] company_id %s not found in DB", company_id)
            return 0

        if self._filter_enabled and not self._passes_acquisition_filter(company):
            logger.debug("[firestore] %s filtered out — not syncing", company_id)
            return 0

        db    = self._get_db()
        count = 0

        # ── Upsert company document ──────────────────────────────────────────
        company_doc = self._company_to_doc(company)
        coll_name   = self._collections.get("companies", "companies")

        db.collection(coll_name).document(company_id).set(
            company_doc, merge=True
        )
        count += 1

        # ── Upsert filings as sub-collection ─────────────────────────────────
        filings_ref = (
            db.collection(coll_name)
              .document(company_id)
              .collection("pipeline_filings")
        )
        for filing in company.filings:
            doc = self._filing_to_doc(filing)
            filings_ref.document(str(filing.id)).set(doc, merge=True)
            count += 1

        # ── Upsert director roles as sub-collection ───────────────────────────
        directors_ref = (
            db.collection(coll_name)
              .document(company_id)
              .collection("pipeline_directors")
        )
        for role in company.director_roles:
            doc = self._director_role_to_doc(role)
            directors_ref.document(str(role.id)).set(doc, merge=True)
            count += 1

        # Mark sync timestamp
        db.collection(coll_name).document(company_id).update({
            "_pipeline.last_synced_at": datetime.now(timezone.utc).isoformat()
        })

        logger.info("[firestore] Synced company %s (%d documents)", company_id, count)
        return count

    def batch_sync(self, session, company_ids: list[str]) -> int:
        """Sync multiple companies. Processes in batches of batch_size."""
        total = 0
        for i in range(0, len(company_ids), self._batch_size):
            chunk = company_ids[i: i + self._batch_size]
            for cid in chunk:
                total += self.sync_company(session, cid)
        return total

    # ── Document builders ─────────────────────────────────────────────────────

    def _company_to_doc(self, company) -> dict:
        """Build a Firestore document from a CanonicalCompany row."""
        return {
            # Native CRM fields (match frontend schema)
            "name":          company.canonical_name,
            "companyType":   company.legal_form or "",
            "location":      self._format_address(company),
            "description":   self._build_description(company),
            "source":        "handelsregister",
            "hrNumber":      company.registry_number or "",
            "hrStatus":      company.status or "active",
            "hrFounded":     company.incorporation_date or "",
            "hrAddress":     self._format_address(company),
            "updatedAt":     datetime.now(timezone.utc).isoformat(),

            # Pipeline-enriched fields (namespaced so the frontend knows the source)
            "_pipeline": {
                "canonical_id":     company.id,
                "court":            company.court or "",
                "court_state":      company.court_state or "",
                "euid":             company.euid or "",
                "industry":         company.industry or "",
                "share_capital":    float(company.share_capital) if company.share_capital else None,
                "first_seen_at":    company.first_seen_at.isoformat() if company.first_seen_at else "",
                "source_count":     len(company.sources),
            },
        }

    def _filing_to_doc(self, filing) -> dict:
        parsed = {}
        if filing.parsed_data:
            try:
                parsed = json.loads(filing.parsed_data)
            except (ValueError, TypeError):
                pass

        return {
            "filing_type":  filing.filing_type,
            "filing_date":  filing.filing_date,
            "fiscal_year":  filing.fiscal_year,
            "source":       filing.source,
            "revenue_eur":  float(filing.revenue_eur) if filing.revenue_eur else None,
            "ebitda_eur":   float(filing.ebitda_eur) if filing.ebitda_eur else None,
            "employees":    filing.employees,
            "document_url": filing.document_url,
            "parsed":       parsed,
            "_pipeline_filing_id": filing.id,
        }

    def _director_role_to_doc(self, role) -> dict:
        return {
            "director_id":   role.director_id,
            "full_name":     role.director.full_name if role.director else "",
            "role":          role.role or "",
            "start_date":    role.start_date or "",
            "end_date":      role.end_date or "",
            "source":        role.source or "",
            "_pipeline_role_id": role.id,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _format_address(self, company) -> str:
        parts = filter(None, [
            company.street_address,
            company.postal_code,
            company.city,
        ])
        return ", ".join(parts)

    def _build_description(self, company) -> str:
        parts = []
        if company.legal_form:
            parts.append(company.legal_form)
        if company.incorporation_date:
            parts.append(f"Founded {company.incorporation_date}")
        if company.registry_number:
            parts.append(f"Register: {company.registry_number}")
        if company.status:
            parts.append(f"Status: {company.status}")
        return " · ".join(parts)

    def _passes_acquisition_filter(self, company) -> bool:
        """
        Only sync companies that look like viable acquisition targets.
        Mirror of the acquisition filter logic in pipeline.yaml.
        """
        if company.status not in ("active", "unknown", ""):
            return False
        if company.legal_form not in (
            "GmbH", "GmbH & Co. KG", "AG", "e.K.", "KG", "OHG", ""
        ):
            return False
        return True
