"""
pipeline/enrichment/director_graph.py
──────────────────────────────────────
Builds a director network graph for a company.

Purpose for M&A sourcing:
  • Identify serial founders / repeat owners across portfolio companies
  • Detect hidden related-party connections
  • Flag directors who appear in many companies (potential holding structures)
  • Track director tenure (long-tenured = succession risk / opportunity)
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import select

from pipeline.db.models import (
    CanonicalCompany, Director, DirectorRole,
)
from pipeline.entity_resolution.matchers import normalise_company_name, fuzzy_score

logger = logging.getLogger(__name__)

_FUZZY_THRESHOLD = 0.88   # name similarity to treat two director records as the same person


class DirectorGraph:
    """
    Builds and maintains the director ↔ company relationship graph.
    Called by the enrichment task after entity resolution.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    # ── Public interface ──────────────────────────────────────────────────────

    def build_for_company(self, company_id: str) -> int:
        """
        Ingest director data for a company.  Returns count of roles upserted.

        Data comes from:
          1. Representatives already parsed into _hrResults / normalised company dict
          2. Parsed filing PDFs (directors extracted by pdf_parser)

        In practice this method is called AFTER both Phase 1 and Phase 2
        data have been merged into the canonical company record.
        """
        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            logger.warning("[directors] company_id %s not found", company_id)
            return 0

        # Pull director data from company_sources raw JSON
        raw_directors: list[dict] = self._collect_raw_directors(company)
        if not raw_directors:
            logger.debug("[directors] No director data for %s", company_id)
            return 0

        count = 0
        for raw in raw_directors:
            resolved_id = self._resolve_director(raw["name"])
            self._upsert_role(
                director_id = resolved_id,
                company_id  = company_id,
                role        = raw.get("role", ""),
                start_date  = raw.get("start_date", ""),
                end_date    = raw.get("end_date", ""),
                source      = raw.get("source", ""),
            )
            count += 1

        self._session.flush()
        logger.info("[directors] Upserted %d roles for company %s", count, company_id)
        return count

    def get_network(self, company_id: str, depth: int = 2) -> dict:
        """
        Return a JSON-serialisable director network graph centred on `company_id`.

        Returns:
            {
              "nodes": [{"id": ..., "label": ..., "type": "company"|"director"}],
              "edges": [{"source": ..., "target": ..., "role": ...}]
            }
        """
        visited_companies: set[str]  = set()
        visited_directors: set[str]  = set()
        nodes: list[dict] = []
        edges: list[dict] = []

        self._traverse(
            company_id, depth,
            visited_companies, visited_directors,
            nodes, edges,
        )

        return {"nodes": nodes, "edges": edges}

    # ── Internal ──────────────────────────────────────────────────────────────

    def _collect_raw_directors(self, company: CanonicalCompany) -> list[dict]:
        """Pull raw director data from company_sources JSON."""
        import json as _json

        directors: list[dict] = []
        seen: set[str] = set()

        for source in company.sources:
            raw = source.raw_json or "{}"
            try:
                data = _json.loads(raw)
            except (ValueError, TypeError):
                continue

            # Representatives array from Apify normaliser
            reps = data.get("representatives", [])
            for r in reps:
                if isinstance(r, str):
                    if r not in seen:
                        seen.add(r)
                        directors.append({"name": r, "role": "unknown", "source": source.source})
                elif isinstance(r, dict):
                    name = r.get("full_name") or r.get("name") or ""
                    if name and name not in seen:
                        seen.add(name)
                        directors.append({
                            "name":   name,
                            "role":   r.get("role") or r.get("position") or "unknown",
                            "source": source.source,
                        })

            # Directors extracted from PDF parser
            for d in data.get("directors", []):
                if isinstance(d, dict):
                    name = d.get("name", "")
                    if name and name not in seen:
                        seen.add(name)
                        directors.append({
                            "name":   name,
                            "role":   d.get("role", ""),
                            "source": source.source,
                        })

        return directors

    def _resolve_director(self, full_name: str) -> str:
        """
        Find an existing Director record for this name, or create one.
        Uses fuzzy matching to deduplicate (e.g. "Hans Müller" == "H. Müller").
        """
        norm = normalise_company_name(full_name)   # reuse name normaliser for people too

        # Exact normalised-name lookup first
        stmt = select(Director).where(Director.normalized_name == norm)
        exact = self._session.execute(stmt).scalar_one_or_none()
        if exact:
            return exact.id

        # Fuzzy search among directors with similar token length
        stmt = select(Director)
        candidates = self._session.execute(stmt).scalars().all()
        for candidate in candidates:
            if fuzzy_score(norm, candidate.normalized_name or "") >= _FUZZY_THRESHOLD:
                logger.debug("[directors] Fuzzy match: %r ≈ %r", full_name, candidate.full_name)
                return candidate.id

        # Create new director
        director = Director(
            id              = str(uuid.uuid4()),
            full_name       = full_name,
            normalized_name = norm,
        )
        self._session.add(director)
        self._session.flush()
        return director.id

    def _upsert_role(
        self,
        director_id: str, company_id: str, role: str,
        start_date: str, end_date: str, source: str,
    ) -> None:
        """Insert or skip a DirectorRole (unique on director+company+role+start_date)."""
        from sqlalchemy import and_

        stmt = select(DirectorRole).where(
            and_(
                DirectorRole.director_id == director_id,
                DirectorRole.company_id  == company_id,
                DirectorRole.role        == role,
            )
        )
        existing = self._session.execute(stmt).scalar_one_or_none()
        if existing:
            return   # already recorded

        role_obj = DirectorRole(
            director_id = director_id,
            company_id  = company_id,
            role        = role,
            start_date  = start_date,
            end_date    = end_date,
            source      = source,
        )
        self._session.add(role_obj)

    def _traverse(
        self,
        company_id: str, depth: int,
        visited_companies: set, visited_directors: set,
        nodes: list, edges: list,
    ) -> None:
        """BFS traversal to build the network graph."""
        if depth < 0 or company_id in visited_companies:
            return

        visited_companies.add(company_id)
        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            return

        nodes.append({
            "id":    f"c:{company_id}",
            "label": company.canonical_name,
            "type":  "company",
        })

        for role in company.director_roles:
            d_node_id = f"d:{role.director_id}"
            edges.append({
                "source": d_node_id,
                "target": f"c:{company_id}",
                "role":   role.role or "",
            })

            if role.director_id not in visited_directors:
                visited_directors.add(role.director_id)
                director = self._session.get(Director, role.director_id)
                if director:
                    nodes.append({
                        "id":    d_node_id,
                        "label": director.full_name,
                        "type":  "director",
                    })
                    # Follow this director to other companies (depth-limited)
                    for other_role in director.roles:
                        if other_role.company_id != company_id:
                            self._traverse(
                                other_role.company_id, depth - 1,
                                visited_companies, visited_directors,
                                nodes, edges,
                            )
