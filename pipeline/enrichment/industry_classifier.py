"""
pipeline/enrichment/industry_classifier.py
────────────────────────────────────────────
Classifies companies into industry verticals using a keyword-first
approach, optionally upgrading to a TF-IDF model or LLM for
ambiguous cases.

Industry labels are chosen for M&A relevance:
  manufacturing, industrial, technology, healthcare, logistics,
  food_beverage, professional_services, retail, construction,
  financial_services, real_estate, hospitality, other

Classification signals (in priority order):
  1. SIC/WZ code from filing data (exact mapping)
  2. Keyword match on company name + business purpose
  3. TF-IDF model on business purpose text (if available)
  4. LLM fallback (last resort)
"""

from __future__ import annotations

import logging
import re
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ─── Keyword rules ───────────────────────────────────────────────────────────
# Each rule: (industry_label, [keyword_patterns])
# First match wins — most specific patterns should come first.

_KEYWORD_RULES: list[tuple[str, list[str]]] = [
    ("healthcare", [
        r"\bärzt", r"\bmedizin", r"\barztprax", r"\bklinik", r"\bpharma",
        r"\bgesundheit", r"\bkrankenhaus", r"\bapotheke", r"\bpflege",
        r"\btherapie", r"\bdental", r"\boptik",
    ]),
    ("technology", [
        r"\bsoftware", r"\bit-", r"\bit\b", r"\bdigital", r"\binternet",
        r"\bcloud", r"\bdaten", r"\btechnologi", r"\bsystem", r"\bautomation",
        r"\binformat", r"\bcomputer", r"\bnetzwerk", r"\bcybersecurity",
    ]),
    ("manufacturing", [
        r"\bfertigung", r"\bherstellung", r"\bmaschinen", r"\bmetall",
        r"\bstahl", r"\bkunststoff", r"\bwerkzeug", r"\bteile", r"\bkomponent",
        r"\bverarbeitung", r"\bproduktion", r"\bindustrie",
    ]),
    ("industrial", [
        r"\binstallation", r"\bsanitär", r"\bheizung", r"\bklima", r"\belektro",
        r"\bbau\b", r"\bbauunternehmen", r"\bhochbau", r"\btiefbau",
        r"\bgebäude", r"\btechnik", r"\banlagenbau",
    ]),
    ("logistics", [
        r"\bspedition", r"\btransport", r"\blogistik", r"\bfracht",
        r"\blieferung", r"\bversand", r"\blager", r"\bkurier", r"\bfuhrpark",
    ]),
    ("food_beverage", [
        r"\bbäckerei", r"\bfleisch", r"\bgetränk", r"\brestaur", r"\bgastronomie",
        r"\bkonditorei", r"\blebens?mittel", r"\bbrauerei", r"\bweinhandel",
        r"\bcatering", r"\bimbiss",
    ]),
    ("construction", [
        r"\bbau\b", r"\barchitekt", r"\bimmobilien", r"\brenovier",
        r"\bsanierung", r"\btrockenbau", r"\bmaurer", r"\bzimmerer",
        r"\bfliesen", r"\bdach",
    ]),
    ("real_estate", [
        r"\bimmobilien", r"\bvermietung", r"\bverwaltung.*immob",
        r"\bhausverwaltung", r"\bwohnpark", r"\bgewerbepark",
    ]),
    ("retail", [
        r"\bhandel\b", r"\beinzelhandel", r"\bgroßhandel", r"\bshop",
        r"\bmarkt\b", r"\bkaufhaus", r"\bvertrieb", r"\bversandhandel",
    ]),
    ("professional_services", [
        r"\bberatung", r"\bsteuer", r"\brecht", r"\banwalt", r"\bwirtschafts",
        r"\bprüfung", r"\bkanzlei", r"\bpersonal", r"\brekrutierung",
        r"\bmarketing", r"\bwerbung",
    ]),
    ("financial_services", [
        r"\bbank", r"\bversicherung", r"\bfinanz", r"\bkapital",
        r"\binvestment", r"\bvermögens", r"\bleasing", r"\bfactoring",
    ]),
    ("hospitality", [
        r"\bhotel", r"\bpension", r"\bherberge", r"\btouristik",
        r"\breisebüro", r"\bfreizeit", r"\bwellness",
    ]),
]

# WZ-2008 / NACE code prefixes → industry label
_WZ_CODE_MAP: dict[str, str] = {
    "01": "agriculture", "10": "food_beverage", "11": "food_beverage",
    "13": "manufacturing", "14": "manufacturing", "15": "manufacturing",
    "16": "manufacturing", "17": "manufacturing", "20": "manufacturing",
    "24": "manufacturing", "25": "industrial", "26": "technology",
    "27": "industrial", "28": "industrial", "29": "manufacturing",
    "33": "industrial", "41": "construction", "42": "construction",
    "43": "construction", "45": "retail", "46": "retail", "47": "retail",
    "49": "logistics", "50": "logistics", "51": "logistics", "52": "logistics",
    "55": "hospitality", "56": "food_beverage", "58": "technology",
    "62": "technology", "63": "technology", "64": "financial_services",
    "65": "financial_services", "66": "financial_services",
    "68": "real_estate", "69": "professional_services",
    "70": "professional_services", "71": "professional_services",
    "72": "technology", "73": "professional_services",
    "74": "professional_services", "75": "healthcare",
    "77": "professional_services", "78": "professional_services",
    "80": "professional_services", "82": "professional_services",
    "85": "professional_services", "86": "healthcare", "87": "healthcare",
    "88": "healthcare",
}


class IndustryClassifier:
    """Classifies companies into standardised industry verticals."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def classify_company(self, company_id: str) -> str | None:
        """
        Classify a company and persist the industry label.
        Returns the assigned industry label or None.
        """
        from pipeline.db.models import CanonicalCompany
        import json as _json

        company = self._session.get(CanonicalCompany, company_id)
        if not company:
            return None

        # Gather classification signals
        name    = company.canonical_name or ""
        purpose = company.industry_raw   or ""

        # Also check raw source JSON for business_purpose / wz_code
        for source in company.sources:
            try:
                data = _json.loads(source.raw_json or "{}")
                if not purpose:
                    purpose = data.get("business_purpose") or data.get("purpose") or ""
                wz_code = str(data.get("wz_code") or "")
                if wz_code:
                    label = self._from_wz_code(wz_code)
                    if label:
                        company.industry = label
                        self._session.flush()
                        return label
            except Exception:
                continue

        # Keyword classification
        label = self._keyword_classify(name + " " + purpose)

        if not label and len(purpose) > 20:
            # LLM fallback for ambiguous cases
            label = self._llm_classify(name, purpose)

        company.industry     = label or "other"
        company.industry_raw = purpose[:500] if purpose else ""
        self._session.flush()

        logger.info("[industry] %s → %s", company.canonical_name, company.industry)
        return company.industry

    def classify_text(self, name: str, purpose: str) -> str:
        """
        Stateless convenience method — classify without DB access.
        Returns industry label string.
        """
        label = self._keyword_classify(name + " " + purpose)
        if not label and len(purpose) > 20:
            label = self._llm_classify(name, purpose)
        return label or "other"

    # ── Classification methods ────────────────────────────────────────────────

    def _keyword_classify(self, text: str) -> str:
        """
        Match keywords against the combined name + purpose text.
        Returns the first matching industry label, or "".
        """
        text_lower = text.lower()
        for label, patterns in _KEYWORD_RULES:
            for pat in patterns:
                if re.search(pat, text_lower):
                    return label
        return ""

    def _from_wz_code(self, code: str) -> str:
        """Map a WZ-2008 / NACE code prefix to industry label."""
        prefix = code.strip()[:2]
        return _WZ_CODE_MAP.get(prefix, "")

    def _llm_classify(self, name: str, purpose: str) -> str:
        """
        Use an LLM to classify when keyword matching fails.
        Returns one of the known industry labels or "other".
        """
        import os

        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return ""

        labels = ", ".join([l for l, _ in _KEYWORD_RULES] + ["agriculture", "other"])
        prompt = (
            f"Classify this German company into one industry label.\n"
            f"Company: {name}\n"
            f"Business purpose: {purpose[:400]}\n"
            f"Available labels: {labels}\n"
            f"Respond with ONLY the label, nothing else."
        )

        try:
            # Try OpenAI
            openai_key = os.environ.get("OPENAI_API_KEY", "")
            if openai_key:
                import openai
                client = openai.OpenAI(api_key=openai_key)
                resp   = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=20,
                    temperature=0,
                )
                label = resp.choices[0].message.content.strip().lower()
                known = {l for l, _ in _KEYWORD_RULES}
                return label if label in known else "other"
        except Exception as exc:
            logger.debug("[industry] LLM classify error: %s", exc)

        return ""
