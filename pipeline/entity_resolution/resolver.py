"""
pipeline/entity_resolution/resolver.py
────────────────────────────────────────
Entity resolution engine: assigns a canonical_company_id to every
incoming company record regardless of which source it came from.

Match priority (highest → lowest):
  1. Exact registry number match  → authoritative, confidence=1.0
  2. EUID match                   → authoritative, confidence=1.0
  3. Fuzzy name + court match     → high confidence if both agree
  4. Fuzzy name + state match     → medium confidence
  5. Fuzzy name only              → lower confidence, manual review flag

Design:
  • The resolver is stateful — it holds a SQLAlchemy session.
  • All decisions are stored in entity_mappings for auditability.
  • New companies get a freshly generated UUID.
  • The same resolver instance should be reused within a single
    ingestion batch for performance (avoids re-querying for every record).
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from pipeline.config import config as cfg_module
from pipeline.db.models import CanonicalCompany, EntityMapping
from pipeline.entity_resolution.matchers import (
    normalise_company_name,
    fuzzy_score,
    registry_key,
)

logger = logging.getLogger(__name__)

_match_cfg = cfg_module.get("matching") or {}
_FUZZY_THRESHOLD    = float(_match_cfg.get("fuzzy_threshold", 0.85))
_WEIGHTS            = _match_cfg.get("weights", {
    "name": 0.60, "address": 0.20, "director_overlap": 0.20
})


@dataclass
class ResolveResult:
    company_id:    str
    is_new:        bool
    match_method:  str       # "exact_registry" | "exact_euid" | "fuzzy_name" | "new"
    confidence:    float     # 0.0 – 1.0


class EntityResolver:
    """
    Resolves an incoming parsed company dict to a canonical_company_id.
    Uses the SQLAlchemy session for all DB operations.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    # ── Public interface ──────────────────────────────────────────────────────

    def resolve(self, parsed: dict) -> tuple[str, bool]:
        """
        Main entry point.

        Args:
            parsed: Normalised company dict from the parsing layer.
                    Expected keys: company_name, registry_number, court,
                                   legal_form, postal_code, city, euid, source

        Returns:
            (canonical_company_id, is_new)
        """
        result = self._resolve_impl(parsed)

        # Persist the mapping for future lookups
        self._record_mapping(parsed, result)

        if not result.is_new:
            # Update the canonical record with any new fields
            self._merge_into_canonical(parsed, result.company_id)

        return result.company_id, result.is_new

    # ── Resolution pipeline ───────────────────────────────────────────────────

    def _resolve_impl(self, parsed: dict) -> ResolveResult:
        source    = parsed.get("source", "")
        source_id = parsed.get("source_id", parsed.get("registry_number", ""))

        # ── 0. Already mapped? ────────────────────────────────────────────────
        if source and source_id:
            existing_id = self._lookup_mapping(source, source_id)
            if existing_id:
                return ResolveResult(
                    company_id=existing_id, is_new=False,
                    match_method="cached_mapping", confidence=1.0,
                )

        # ── 1. Registry number exact match ────────────────────────────────────
        rn = parsed.get("registry_number", "").strip()
        if rn:
            candidate = self._match_by_registry(rn, parsed.get("court", ""))
            if candidate:
                return ResolveResult(
                    company_id=candidate.id, is_new=False,
                    match_method="exact_registry", confidence=1.0,
                )

        # ── 2. EUID exact match ───────────────────────────────────────────────
        euid = parsed.get("euid", "").strip()
        if euid:
            candidate = self._match_by_euid(euid)
            if candidate:
                return ResolveResult(
                    company_id=candidate.id, is_new=False,
                    match_method="exact_euid", confidence=1.0,
                )

        # ── 3. Fuzzy name match ───────────────────────────────────────────────
        name = parsed.get("company_name", "").strip()
        if name:
            candidate, score, method = self._fuzzy_match(parsed)
            if candidate and score >= _FUZZY_THRESHOLD:
                return ResolveResult(
                    company_id=candidate.id, is_new=False,
                    match_method=method, confidence=score,
                )

        # ── 4. No match → create new canonical entity ─────────────────────────
        new_id = self._create_canonical(parsed)
        return ResolveResult(
            company_id=new_id, is_new=True,
            match_method="new", confidence=1.0,
        )

    # ── Match strategies ──────────────────────────────────────────────────────

    def _match_by_registry(
        self, registry_number: str, court: str = ""
    ) -> Optional[CanonicalCompany]:
        """Exact match on normalised registry number (+ optional court)."""
        key = registry_key(registry_number)
        stmt = select(CanonicalCompany).where(
            CanonicalCompany.registry_number.ilike(f"%{key}%")
        )
        candidates = self._session.execute(stmt).scalars().all()

        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]

        # Multiple matches — narrow by court if available
        if court:
            court_lower = court.lower()
            for c in candidates:
                if c.court and court_lower in c.court.lower():
                    return c

        return candidates[0]   # best guess

    def _match_by_euid(self, euid: str) -> Optional[CanonicalCompany]:
        stmt = select(CanonicalCompany).where(
            CanonicalCompany.euid == euid
        )
        return self._session.execute(stmt).scalar_one_or_none()

    def _fuzzy_match(
        self, parsed: dict
    ) -> tuple[Optional[CanonicalCompany], float, str]:
        """
        Compare the incoming company against existing canonical companies
        using a weighted combination of name + address + court signals.

        Returns (best_candidate, score, method_name).
        """
        name        = parsed.get("company_name", "")
        postal_code = parsed.get("postal_code", "")
        city        = parsed.get("city", "")
        legal_form  = parsed.get("legal_form", "")
        court       = parsed.get("court", "")

        norm_name = normalise_company_name(name)
        if not norm_name:
            return None, 0.0, ""

        # Fetch candidates in the same city / postal code (narrows the search)
        candidates = self._fetch_candidates(postal_code, city, court)
        if not candidates:
            # Fall back to searching all companies — slower but complete
            stmt = select(CanonicalCompany).limit(2000)
            candidates = self._session.execute(stmt).scalars().all()

        best_company: Optional[CanonicalCompany] = None
        best_score = 0.0
        best_method = ""

        for company in candidates:
            score, method = self._score_candidate(parsed, company)
            if score > best_score:
                best_score   = score
                best_company = company
                best_method  = method

        return best_company, best_score, best_method

    def _score_candidate(
        self, parsed: dict, company: CanonicalCompany
    ) -> tuple[float, str]:
        """
        Compute weighted match score between a parsed dict and a
        CanonicalCompany row.  Returns (score 0–1, method_label).
        """
        w_name    = float(_WEIGHTS.get("name", 0.6))
        w_address = float(_WEIGHTS.get("address", 0.2))
        # director_overlap weight reserved for future enrichment

        # ── Name score ─────────────────────────────────────────────────────
        name_a = normalise_company_name(parsed.get("company_name", ""))
        name_b = normalise_company_name(company.canonical_name)
        name_score = fuzzy_score(name_a, name_b)

        # ── Address score ─────────────────────────────────────────────────
        addr_score = 0.0
        pc_a  = (parsed.get("postal_code") or "").strip()
        pc_b  = (company.postal_code or "").strip()
        city_a = (parsed.get("city") or "").lower().strip()
        city_b = (company.city or "").lower().strip()

        if pc_a and pc_b:
            addr_score = 1.0 if pc_a == pc_b else (0.5 if pc_a[:3] == pc_b[:3] else 0.0)
        elif city_a and city_b:
            addr_score = fuzzy_score(city_a, city_b)

        total = name_score * w_name + addr_score * w_address

        if name_score >= 0.95 and addr_score >= 0.9:
            method = "fuzzy_name_address"
        elif name_score >= 0.90:
            method = "fuzzy_name_strong"
        else:
            method = "fuzzy_name"

        return min(total, 1.0), method

    def _fetch_candidates(
        self, postal_code: str, city: str, court: str
    ) -> list[CanonicalCompany]:
        """Fetch nearby companies to limit fuzzy search scope."""
        stmt = select(CanonicalCompany)
        filters = []
        if postal_code:
            filters.append(CanonicalCompany.postal_code == postal_code)
        if city:
            filters.append(CanonicalCompany.city.ilike(f"%{city}%"))
        if court:
            filters.append(CanonicalCompany.court.ilike(f"%{court}%"))

        if filters:
            stmt = stmt.where(or_(*filters))
            return self._session.execute(stmt).scalars().all()
        return []

    # ── Entity creation ───────────────────────────────────────────────────────

    def _create_canonical(self, parsed: dict) -> str:
        """Insert a new CanonicalCompany and return its ID."""
        new_id = str(uuid.uuid4())
        company = CanonicalCompany(
            id                 = new_id,
            canonical_name     = parsed.get("company_name", "Unknown"),
            legal_form         = parsed.get("legal_form", ""),
            registry_number    = parsed.get("registry_number", ""),
            registry_type      = self._registry_type(parsed.get("registry_number", "")),
            court              = parsed.get("court", ""),
            court_state        = parsed.get("court_state", ""),
            status             = parsed.get("status", "unknown"),
            incorporation_date = parsed.get("incorporation_date", ""),
            street_address     = parsed.get("street_address", ""),
            postal_code        = parsed.get("postal_code", ""),
            city               = parsed.get("city", ""),
            euid               = parsed.get("euid", ""),
        )
        self._session.add(company)
        self._session.flush()   # get DB-assigned defaults without committing
        logger.info("[resolver] Created new canonical company: %s (%s)", new_id, company.canonical_name)
        return new_id

    def _merge_into_canonical(self, parsed: dict, company_id: str) -> None:
        """Fill in missing fields on an existing canonical company."""
        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            return

        # Only overwrite if the existing field is empty
        for field, key in [
            ("legal_form",      "legal_form"),
            ("registry_number", "registry_number"),
            ("court",           "court"),
            ("court_state",     "court_state"),
            ("postal_code",     "postal_code"),
            ("city",            "city"),
            ("euid",            "euid"),
            ("incorporation_date", "incorporation_date"),
        ]:
            val = parsed.get(key, "")
            if val and not getattr(company, field):
                setattr(company, field, val)

        self._session.flush()

    # ── Mapping table ─────────────────────────────────────────────────────────

    def _lookup_mapping(self, source: str, source_entity_id: str) -> str | None:
        stmt = select(EntityMapping.canonical_company_id).where(
            EntityMapping.source == source,
            EntityMapping.source_entity_id == source_entity_id,
        )
        return self._session.execute(stmt).scalar_one_or_none()

    def _record_mapping(self, parsed: dict, result: ResolveResult) -> None:
        source    = parsed.get("source", "")
        source_id = parsed.get("source_id", parsed.get("registry_number", ""))
        if not source or not source_id:
            return

        mapping = EntityMapping(
            source               = source,
            source_entity_id     = source_id,
            canonical_company_id = result.company_id,
            confidence           = result.confidence,
            match_method         = result.match_method,
        )
        # Upsert: merge() handles both insert and update
        self._session.merge(mapping)

    # ── Utilities ─────────────────────────────────────────────────────────────

    @staticmethod
    def _registry_type(rn: str) -> str:
        m = re.match(r"(HR[AB]|PR|VR|GnR)", rn.strip().upper())
        return m.group(1) if m else ""
