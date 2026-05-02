"""
pipeline/monitoring/audit_log.py
──────────────────────────────────
Structured audit logging for all pipeline operations.

Wraps Python's standard logging with structured JSON output so logs
are parseable by log aggregators (Datadog, CloudWatch, etc.).

Also provides a high-level AuditLog class for recording pipeline
lifecycle events to the DB (separate from the ChangeLog which records
data changes).
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


# ─── Structured JSON log formatter ───────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "ts":       datetime.utcnow().isoformat() + "Z",
            "level":    record.levelname,
            "logger":   record.name,
            "msg":      record.getMessage(),
            "module":   record.module,
            "func":     record.funcName,
            "line":     record.lineno,
        }

        # Include extra fields attached via logger.info(..., extra={...})
        for key, val in record.__dict__.items():
            if key not in logging.LogRecord.__dict__ and not key.startswith("_"):
                if key not in ("msg", "args", "levelname", "name", "module",
                               "funcName", "lineno", "pathname", "filename",
                               "exc_info", "exc_text", "stack_info",
                               "created", "msecs", "relativeCreated",
                               "thread", "threadName", "process",
                               "processName", "taskName"):
                    log_obj[key] = val

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_obj, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO", json_output: bool = True) -> None:
    """
    Configure the root logger for the pipeline.
    Call once at startup (e.g. in api/app.py or celery worker init).
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter() if json_output else logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    ))

    # Remove any existing handlers
    root.handlers.clear()
    root.addHandler(handler)

    # Quiet noisy third-party loggers
    for noisy in ("httpx", "httpcore", "urllib3", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ─── Audit log class ──────────────────────────────────────────────────────────

class AuditLog:
    """
    Records pipeline lifecycle events for operational visibility.
    These are pipeline events (job started/completed/failed), not data
    changes — see ChangeLog for data-level changes.
    """

    def __init__(self) -> None:
        self._logger = logging.getLogger("pipeline.audit")

    def job_started(self, job_name: str, source: str = "", **meta) -> None:
        self._logger.info("job_started", extra={
            "event":    "job_started",
            "job_name": job_name,
            "source":   source,
            **meta,
        })

    def job_completed(
        self, job_name: str, records: int, duration_s: float, **meta
    ) -> None:
        self._logger.info("job_completed", extra={
            "event":       "job_completed",
            "job_name":    job_name,
            "records":     records,
            "duration_s":  duration_s,
            **meta,
        })

    def job_failed(self, job_name: str, error: str, **meta) -> None:
        self._logger.error("job_failed", extra={
            "event":    "job_failed",
            "job_name": job_name,
            "error":    error,
            **meta,
        })

    def entity_resolved(
        self, company_id: str, method: str, confidence: float, is_new: bool
    ) -> None:
        self._logger.info("entity_resolved", extra={
            "event":      "entity_resolved",
            "company_id": company_id,
            "method":     method,
            "confidence": confidence,
            "is_new":     is_new,
        })

    def document_fetched(
        self, company_id: str, doc_type: str, cost_eur: float, pages: int
    ) -> None:
        self._logger.info("document_fetched", extra={
            "event":      "document_fetched",
            "company_id": company_id,
            "doc_type":   doc_type,
            "cost_eur":   cost_eur,
            "pages":      pages,
        })

    def change_detected(self, company_id: str, event_type: str, is_alert: bool) -> None:
        level = logging.WARNING if is_alert else logging.INFO
        self._logger.log(level, "change_detected", extra={
            "event":      "change_detected",
            "company_id": company_id,
            "event_type": event_type,
            "is_alert":   is_alert,
        })

    def budget_warning(self, spent_eur: float, budget_eur: float) -> None:
        self._logger.warning("budget_warning", extra={
            "event":       "budget_warning",
            "spent_eur":   spent_eur,
            "budget_eur":  budget_eur,
            "pct_used":    round(spent_eur / budget_eur * 100, 1) if budget_eur else 0,
        })
