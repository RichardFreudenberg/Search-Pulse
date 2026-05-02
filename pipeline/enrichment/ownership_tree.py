"""
pipeline/enrichment/ownership_tree.py
───────────────────────────────────────
Builds and queries the ownership graph.

For M&A sourcing, the ownership tree reveals:
  • Whether the company is a subsidiary (→ can't acquire without parent approval)
  • Whether the company has subsidiaries (→ platform acquisition opportunity)
  • Ultimate beneficial owner (UBO) chains
  • Cross-holdings that complicate deal structure
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import select

from pipeline.db.models import (
    CanonicalCompany, Shareholder, OwnershipEdge, EntityMapping,
)

logger = logging.getLogger(__name__)


class OwnershipTree:
    """Builds ownership edges from shareholder data in company sources."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._min_stake = 5.0      # ignore stakes below this threshold

    # ── Public interface ──────────────────────────────────────────────────────

    def build_for_company(self, company_id: str) -> int:
        """
        Parse raw shareholder data for a company and build:
          - Shareholder rows (person or company)
          - OwnershipEdge rows (when the shareholder is itself a known company)

        Returns count of shareholders processed.
        """
        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            return 0

        raw_shareholders = self._collect_shareholders(company)
        if not raw_shareholders:
            logger.debug("[ownership] No shareholder data for %s", company_id)
            return 0

        count = 0
        for raw in raw_shareholders:
            self._upsert_shareholder(company_id, raw)

            # If the shareholder looks like a company, try to resolve it
            if self._looks_like_company(raw.get("name", "")):
                owner_id = self._resolve_owner_company(raw["name"])
                if owner_id and owner_id != company_id:
                    self._upsert_edge(
                        owner_id   = owner_id,
                        owned_id   = company_id,
                        stake_pct  = raw.get("stake_pct"),
                        source     = raw.get("source", ""),
                    )
            count += 1

        self._session.flush()
        logger.info("[ownership] Processed %d shareholders for %s", count, company_id)
        return count

    def get_tree(self, company_id: str, direction: str = "up", depth: int = 3) -> dict:
        """
        Return the ownership tree as a serialisable dict.

        Args:
            company_id: Root company
            direction:  "up" (who owns this?), "down" (what does it own?), "both"
            depth:      Max traversal depth

        Returns:
            {"nodes": [...], "edges": [...]}
        """
        visited: set[str] = set()
        nodes:   list[dict] = []
        edges:   list[dict] = []

        self._traverse(company_id, direction, depth, visited, nodes, edges)
        return {"nodes": nodes, "edges": edges}

    # ── Data collection ───────────────────────────────────────────────────────

    def _collect_shareholders(self, company: CanonicalCompany) -> list[dict]:
        """Extract shareholder data from company_sources raw JSON."""
        shareholders: list[dict] = []
        seen: set[str] = set()

        for source in company.sources:
            try:
                data = json.loads(source.raw_json or "{}")
            except (ValueError, TypeError):
                continue

            # Apify-style shareholders list
            for sh in data.get("shareholders", []):
                name = (
                    sh.get("name") or sh.get("full_name") or
                    sh.get("company_name") or ""
                )
                if not name or name in seen:
                    continue
                seen.add(name)

                stake_raw = sh.get("stake_pct") or sh.get("percentage") or 0.0
                try:
                    stake = float(stake_raw)
                except (TypeError, ValueError):
                    stake = 0.0

                if stake < self._min_stake and stake > 0:
                    continue   # below threshold

                shareholders.append({
                    "name":      name,
                    "stake_pct": stake,
                    "type":      "company" if self._looks_like_company(name) else "person",
                    "source":    source.source,
                })

        return shareholders

    def _upsert_shareholder(self, company_id: str, raw: dict) -> None:
        sh = Shareholder(
            company_id       = company_id,
            name             = raw.get("name", ""),
            stake_pct        = raw.get("stake_pct"),
            shareholder_type = raw.get("type", "unknown"),
            source           = raw.get("source", ""),
        )
        self._session.add(sh)

    def _upsert_edge(
        self, owner_id: str, owned_id: str,
        stake_pct: float | None, source: str,
    ) -> None:
        from sqlalchemy import and_

        stmt = select(OwnershipEdge).where(
            and_(
                OwnershipEdge.owner_company_id == owner_id,
                OwnershipEdge.owned_company_id == owned_id,
            )
        )
        existing = self._session.execute(stmt).scalar_one_or_none()
        if existing:
            if stake_pct is not None:
                existing.stake_pct = stake_pct
            return

        edge = OwnershipEdge(
            owner_company_id = owner_id,
            owned_company_id = owned_id,
            stake_pct        = stake_pct,
            source           = source,
        )
        self._session.add(edge)

    # ── Company resolution ────────────────────────────────────────────────────

    def _resolve_owner_company(self, name: str) -> str | None:
        """
        Look up an existing canonical company by name fuzzy match.
        Returns company_id or None if not found.
        """
        from pipeline.entity_resolution.matchers import normalise_company_name, fuzzy_score

        norm = normalise_company_name(name)
        stmt = select(CanonicalCompany)
        candidates = self._session.execute(stmt).scalars().all()

        best_id    = None
        best_score = 0.0

        for candidate in candidates:
            score = fuzzy_score(norm, normalise_company_name(candidate.canonical_name))
            if score > best_score and score >= 0.90:
                best_score = score
                best_id    = candidate.id

        return best_id

    # ── Traversal ─────────────────────────────────────────────────────────────

    def _traverse(
        self,
        company_id: str, direction: str, depth: int,
        visited: set, nodes: list, edges: list,
    ) -> None:
        if depth < 0 or company_id in visited:
            return

        visited.add(company_id)
        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            return

        nodes.append({
            "id":    company_id,
            "label": company.canonical_name,
            "type":  "company",
        })

        if direction in ("up", "both"):
            for edge in company.ownership_as_owned:
                edges.append({
                    "source":    edge.owner_company_id,
                    "target":    company_id,
                    "stake_pct": edge.stake_pct,
                })
                self._traverse(edge.owner_company_id, direction, depth - 1,
                               visited, nodes, edges)

        if direction in ("down", "both"):
            for edge in company.ownership_as_owner:
                edges.append({
                    "source":    company_id,
                    "target":    edge.owned_company_id,
                    "stake_pct": edge.stake_pct,
                })
                self._traverse(edge.owned_company_id, direction, depth - 1,
                               visited, nodes, edges)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _looks_like_company(self, name: str) -> bool:
        """Return True if the name looks like a corporate entity (not a person)."""
        company_signals = [
            r"\bGmbH\b", r"\bAG\b", r"\bKG\b", r"\bOHG\b", r"\bUG\b",
            r"\bSE\b", r"\be\.K\.", r"\bLtd\b", r"\bS\.A\.\b",
            r"\bHolding\b", r"\bGroup\b", r"\bHoldings\b",
            r"GmbH\s*&\s*Co",
        ]
        for pat in company_signals:
            if re.search(pat, name, re.IGNORECASE):
                return True
        return False
