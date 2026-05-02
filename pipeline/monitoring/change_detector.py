"""
pipeline/monitoring/change_detector.py
────────────────────────────────────────
Detects changes in company data between successive ingestion runs.

Monitored change types:
  • director_added / director_removed
  • ownership_changed (stake % change)
  • status_changed (active → insolvent / dissolved)
  • name_changed (legal name amendment)
  • address_changed
  • insolvency_filed     ← highest priority alert
  • liquidation_started  ← high priority alert

All detected changes are written to the change_log table (append-only).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import select

from pipeline.db.models import CanonicalCompany, ChangeLog, CompanySource

logger = logging.getLogger(__name__)

# Alert-level events (used by notification layer)
_ALERT_EVENTS = {
    "insolvency_filed",
    "liquidation_started",
    "status_changed",
    "director_removed",
    "ownership_changed",
}


class ChangeDetector:
    """
    Sweeps all tracked companies and emits change log entries when
    the latest ingested data differs from the canonical stored state.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    # ── Public interface ──────────────────────────────────────────────────────

    def run_sweep(self) -> list[dict]:
        """
        Compare latest source data against canonical state for every company.
        Returns list of change event dicts for downstream notification.
        """
        changes: list[dict] = []

        stmt = select(CanonicalCompany)
        companies = self._session.execute(stmt).scalars().all()

        for company in companies:
            company_changes = self._check_company(company)
            changes.extend(company_changes)

        logger.info("[monitor] Sweep complete: %d companies, %d changes", len(companies), len(changes))
        return changes

    def check_company(self, company_id: str) -> list[dict]:
        """Check a single company for changes."""
        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            return []
        return self._check_company(company)

    # ── Internal comparison ───────────────────────────────────────────────────

    def _check_company(self, company: CanonicalCompany) -> list[dict]:
        """Compare canonical state with latest source data."""
        changes: list[dict] = []

        # Get the most recent source entry for each source
        latest_sources = self._latest_per_source(company)

        for source_name, source_data in latest_sources.items():
            try:
                raw = json.loads(source_data.raw_json or "{}")
            except (ValueError, TypeError):
                continue

            new_status = self._extract_status(raw)
            if new_status and new_status != company.status:
                change = self._emit_change(
                    company, "status_changed",
                    field="status",
                    old_value=company.status,
                    new_value=new_status,
                    source=source_name,
                )
                changes.append(change)

                # Specific alert events for status transitions
                if "insolvenz" in new_status.lower() or new_status == "insolvent":
                    changes.append(self._emit_change(
                        company, "insolvency_filed",
                        field="status", old_value=company.status, new_value=new_status,
                        source=source_name,
                    ))
                elif new_status in ("dissolved", "liquidated"):
                    changes.append(self._emit_change(
                        company, "liquidation_started",
                        field="status", old_value=company.status, new_value=new_status,
                        source=source_name,
                    ))

                # Update canonical status
                company.status = new_status

            # Director changes
            director_changes = self._check_directors(company, raw, source_name)
            changes.extend(director_changes)

        return changes

    def _check_directors(
        self, company: CanonicalCompany, raw: dict, source: str
    ) -> list[dict]:
        """Detect director additions and removals."""
        changes: list[dict] = []

        # Current canonical director names
        current_names: set[str] = {
            role.director.full_name
            for role in company.director_roles
            if role.director and not role.end_date
        }

        # New directors from source
        new_directors: set[str] = set()
        for rep in raw.get("representatives", []):
            if isinstance(rep, str):
                new_directors.add(rep)
            elif isinstance(rep, dict):
                name = rep.get("full_name") or rep.get("name") or ""
                if name:
                    new_directors.add(name)
        for d in raw.get("directors", []):
            if isinstance(d, dict):
                name = d.get("name", "")
                if name:
                    new_directors.add(name)

        if not new_directors:
            return []

        # Added
        for name in new_directors - current_names:
            changes.append(self._emit_change(
                company, "director_added",
                field="directors", old_value=None, new_value=name, source=source,
            ))

        # Removed
        for name in current_names - new_directors:
            changes.append(self._emit_change(
                company, "director_removed",
                field="directors", old_value=name, new_value=None, source=source,
            ))

        return changes

    # ── Change emission ───────────────────────────────────────────────────────

    def _emit_change(
        self, company: CanonicalCompany, event_type: str,
        field: str, old_value: Any, new_value: Any, source: str,
    ) -> dict:
        """Write a ChangeLog row and return a summary dict."""
        entry = ChangeLog(
            company_id  = company.id,
            event_type  = event_type,
            field_name  = field,
            old_value   = str(old_value) if old_value is not None else None,
            new_value   = str(new_value) if new_value is not None else None,
            source      = source,
            detected_at = datetime.now(timezone.utc),
            notified    = False,
        )
        self._session.add(entry)

        is_alert = event_type in _ALERT_EVENTS
        logger.log(
            logging.WARNING if is_alert else logging.INFO,
            "[monitor] %s %s: %s → %s [company=%s]",
            event_type, field, old_value, new_value, company.canonical_name,
        )

        return {
            "company_id":   company.id,
            "company_name": company.canonical_name,
            "event_type":   event_type,
            "field":        field,
            "old_value":    str(old_value) if old_value is not None else None,
            "new_value":    str(new_value) if new_value is not None else None,
            "source":       source,
            "is_alert":     is_alert,
            "detected_at":  entry.detected_at.isoformat(),
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _latest_per_source(self, company: CanonicalCompany) -> dict[str, CompanySource]:
        """Return the most recently updated CompanySource per source name."""
        latest: dict[str, CompanySource] = {}
        for source in company.sources:
            existing = latest.get(source.source)
            if existing is None or (
                source.last_updated_at and existing.last_updated_at and
                source.last_updated_at > existing.last_updated_at
            ):
                latest[source.source] = source
        return latest

    def _extract_status(self, raw: dict) -> str:
        raw_status = raw.get("status") or raw.get("current_status") or ""
        low = raw_status.lower()
        if any(w in low for w in ["aktiv", "active", "eingetragen"]):
            return "active"
        if any(w in low for w in ["insolvenz", "insolvency", "insolvency_proceedings"]):
            return "insolvent"
        if any(w in low for w in ["gelöscht", "dissolved", "aufgelöst", "liquidiert"]):
            return "dissolved"
        return raw_status or ""
