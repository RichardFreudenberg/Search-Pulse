"""
pipeline/retrieval/cost_tracker.py
────────────────────────────────────
Tracks per-document retrieval costs and enforces monthly budget caps.

Cost tracking is critical when fetching paid documents from portals
like Bundesanzeiger (€1–3/document).  This module:

  • Records every document fetch with its cost
  • Provides can_afford() check before any paid fetch
  • Returns month-to-date spend for dashboards
  • Warns at 80% of budget and hard-blocks at 100%
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class CostTracker:
    """
    Manages retrieval budget and records per-document costs.
    Uses the pipeline DB for persistence.
    """

    def __init__(self, cfg: dict) -> None:
        self._monthly_budget = float(cfg.get("monthly_budget_eur", 500.0))
        self._max_per_doc    = float(cfg.get("max_cost_per_document_eur", 2.50))

    # ── Budget checks ─────────────────────────────────────────────────────────

    def can_afford(self, additional_eur: float | None = None) -> bool:
        """
        Return True if there is remaining budget for this month.
        If additional_eur is given, checks that specific amount too.
        """
        from pipeline.db.database import get_session
        from pipeline.db.models import RetrievalCost
        from sqlalchemy import func, extract

        try:
            with get_session() as session:
                now   = datetime.now(timezone.utc)
                spent = session.query(
                    func.coalesce(func.sum(RetrievalCost.cost_eur), 0.0)
                ).filter(
                    extract("year",  RetrievalCost.fetched_at) == now.year,
                    extract("month", RetrievalCost.fetched_at) == now.month,
                ).scalar()

                spent = float(spent or 0.0)
                remaining = self._monthly_budget - spent

                if remaining <= 0:
                    logger.warning("[cost] Monthly budget exhausted (spent=€%.2f)", spent)
                    return False

                if remaining < self._monthly_budget * 0.2:
                    logger.warning("[cost] Low budget: €%.2f remaining (€%.2f/month)", remaining, self._monthly_budget)

                if additional_eur is not None:
                    return remaining >= additional_eur

                return True

        except Exception as exc:
            # DB not available — allow the fetch and log
            logger.error("[cost] DB unavailable for budget check: %s", exc)
            return True

    def month_to_date(self) -> float:
        """Return total EUR spent this calendar month."""
        from pipeline.db.database import get_session
        from pipeline.db.models import RetrievalCost
        from sqlalchemy import func, extract

        try:
            with get_session() as session:
                now   = datetime.now(timezone.utc)
                spent = session.query(
                    func.coalesce(func.sum(RetrievalCost.cost_eur), 0.0)
                ).filter(
                    extract("year",  RetrievalCost.fetched_at) == now.year,
                    extract("month", RetrievalCost.fetched_at) == now.month,
                ).scalar()
                return float(spent or 0.0)
        except Exception:
            return 0.0

    # ── Recording ─────────────────────────────────────────────────────────────

    def record(self, cost_eur: float, company_id: str, doc_type: str) -> None:
        """Insert a cost record for a fetched document."""
        from pipeline.db.database import get_session
        from pipeline.db.models import RetrievalCost

        try:
            with get_session() as session:
                entry = RetrievalCost(
                    company_id    = company_id,
                    document_type = doc_type,
                    cost_eur      = cost_eur,
                    source        = "bundesanzeiger",
                    fetched_at    = datetime.now(timezone.utc),
                )
                session.add(entry)
            logger.info("[cost] Recorded €%.2f for company %s (%s)", cost_eur, company_id, doc_type)
        except Exception as exc:
            logger.error("[cost] Failed to record cost: %s", exc)

    def summary(self) -> dict:
        """Return budget summary dict for API/dashboard use."""
        mtd  = self.month_to_date()
        return {
            "monthly_budget_eur":  self._monthly_budget,
            "month_to_date_eur":   mtd,
            "remaining_eur":       max(0.0, self._monthly_budget - mtd),
            "utilization_pct":     round(mtd / self._monthly_budget * 100, 1) if self._monthly_budget else 0.0,
        }
