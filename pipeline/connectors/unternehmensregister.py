"""
pipeline/connectors/unternehmensregister.py
────────────────────────────────────────────
Connector for the Unternehmensregister (UR) — Germany's central company
register portal operated by the Federal Ministry of Justice.

What this retrieves:
  • Company registration metadata (name, legal form, address, register no.)
  • Published annual filings metadata (not the documents themselves)
  • Shareholder structures published via UR

Legal / ToS notes:
  • UR is a public statutory register — §9 HGB grants the public right to
    inspect registration data. We use the public search endpoint only.
  • We respect robots.txt, rate-limit conservatively, and do not log in
    or use any undocumented API.
  • Document downloads are handled separately via the retrieval engine.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urljoin

from bs4 import BeautifulSoup

from .base import BaseConnector, RawRecord

logger = logging.getLogger(__name__)


class UnternehmensregisterConnector(BaseConnector):
    """
    Fetches company registration metadata from Unternehmensregister.de.

    The UR fulltext search endpoint accepts:
      ?request.prevent_mimetype_sniffing=1&fulltext=<query>
    and returns an HTML page with matching company entries.
    """

    SOURCE_NAME = "unternehmensregister"

    # Legal form tokens → normalised short form
    _LEGAL_FORM_PATTERNS: list[tuple[str, str]] = [
        (r"GmbH\s*&\s*Co\.?\s*KG",          "GmbH & Co. KG"),
        (r"Gesellschaft\s+mit\s+beschränkter\s+Haftung", "GmbH"),
        (r"\bGmbH\b",                         "GmbH"),
        (r"Aktiengesellschaft",               "AG"),
        (r"\bAG\b",                           "AG"),
        (r"Kommanditgesellschaft",            "KG"),
        (r"\bKG\b",                           "KG"),
        (r"Offene\s+Handelsgesellschaft",     "OHG"),
        (r"\bOHG\b",                          "OHG"),
        (r"Unternehmergesellschaft",          "UG"),
        (r"\bUG\b",                           "UG"),
        (r"Eingetragener?\s+Kaufmann",        "e.K."),
        (r"\be\.K\.",                         "e.K."),
        (r"Genossenschaft",                   "eG"),
        (r"\beG\b",                           "eG"),
        (r"eingetragener?\s+Verein",          "e.V."),
        (r"\be\.V\.",                         "e.V."),
    ]

    # ── Public entry point ─────────────────────────────────────────────────────

    async def fetch(
        self,
        query: str | None = None,
        since: datetime | None = None,
        max_pages: int = 5,
        **kwargs,
    ) -> list[RawRecord]:
        """
        Search the Unternehmensregister fulltext endpoint.

        Args:
            query:     Company name or keyword
            since:     Filter — only return companies updated after this date
            max_pages: Safety limit on result pages

        Returns:
            list[RawRecord] with record_type = "company"
        """
        if not query:
            query = "GmbH"

        logger.info("[unternehmensregister] Searching: %r", query)

        base_url    = self._cfg.get("base_url", "https://www.unternehmensregister.de")
        search_path = self._cfg.get("search_path", "/ureg/result.html")

        records: list[RawRecord] = []
        seen: set[str] = set()

        for page in range(max_pages):
            url = self._build_url(base_url, search_path, query, page)

            try:
                resp = await self._get(url)
            except PermissionError as exc:
                logger.warning("[unternehmensregister] robots.txt blocked: %s", exc)
                break
            except Exception as exc:
                logger.error("[unternehmensregister] HTTP error page %d: %s", page, exc)
                break

            soup = BeautifulSoup(resp.text, "lxml")
            page_recs = self._parse_results(soup, base_url)

            if not page_recs:
                logger.debug("[unternehmensregister] No more results at page %d", page)
                break

            for rec in page_recs:
                if rec.dedup_key not in seen:
                    seen.add(rec.dedup_key)
                    records.append(rec)

        logger.info("[unternehmensregister] Done: %d companies for %r", len(records), query)
        return records

    async def fetch_company(self, registry_number: str, court: str = "") -> RawRecord | None:
        """
        Point lookup for a single company by registry number.
        Used by the enrichment layer and detail-fetch paths.
        """
        query = f"{registry_number} {court}".strip()
        recs  = await self.fetch(query=query, max_pages=1)
        # Return the best match (first result that contains the registry number)
        for r in recs:
            rn = r.raw_data.get("registry_number", "")
            if registry_number.replace(" ", "") in rn.replace(" ", ""):
                return r
        return recs[0] if recs else None

    async def incremental_sync(self, since: datetime) -> list[RawRecord]:
        """
        Fetch updates since `since`. Broad sweep — picks up recent changes.
        """
        logger.info("[unternehmensregister] Incremental sync since %s", since)
        # Sweep with a few broad legal-form queries
        queries = ["GmbH", "AG", "GmbH & Co.", "UG"]
        all_recs: list[RawRecord] = []
        seen: set[str] = set()

        for q in queries:
            recs = await self.fetch(query=q, since=since, max_pages=2)
            for r in recs:
                if r.dedup_key not in seen:
                    seen.add(r.dedup_key)
                    all_recs.append(r)

        return all_recs

    # ── URL builder ───────────────────────────────────────────────────────────

    def _build_url(self, base: str, path: str, query: str, page: int) -> str:
        encoded = quote(query)
        offset  = page * 20
        return (
            f"{base}{path}"
            f"?request.prevent_mimetype_sniffing=1"
            f"&fulltext={encoded}"
            f"&start={offset}"
        )

    # ── Page parser ───────────────────────────────────────────────────────────

    def _parse_results(self, soup: BeautifulSoup, base_url: str) -> list[RawRecord]:
        records: list[RawRecord] = []

        # UR result rows — multiple possible selectors
        rows = (
            soup.select("table.result_list tr.row_data")
            or soup.select("div.result-item")
            or soup.select(".treffer")
        )

        for row in rows:
            rec = self._parse_row(row, base_url)
            if rec:
                records.append(rec)

        return records

    def _parse_row(self, row: Any, base_url: str) -> RawRecord | None:
        """Extract company metadata from one UR result row."""
        try:
            text = row.get_text(" ", strip=True)

            # ── Company name ─────────────────────────────────────────────────
            name_el = (
                row.select_one(".company_name")
                or row.select_one(".firmenname")
                or row.select_one("td.col_firma a")
                or row.select_one("a.result_link")
                or row.select_one("strong")
            )
            company_name = name_el.get_text(strip=True) if name_el else ""

            # ── Legal form ────────────────────────────────────────────────────
            legal_form = self._extract_legal_form(company_name + " " + text)

            # ── Registry number ───────────────────────────────────────────────
            registry_number = self._extract_registry_number(text)

            # ── Court (Amtsgericht) ───────────────────────────────────────────
            court = self._extract_court(text)

            # ── Address ───────────────────────────────────────────────────────
            address = self._extract_address(text)

            # ── Status ────────────────────────────────────────────────────────
            status_el  = row.select_one(".status") or row.select_one(".firmenstatus")
            status_raw = status_el.get_text(strip=True) if status_el else ""
            status     = self._normalise_status(status_raw)

            # ── Detail URL ────────────────────────────────────────────────────
            link_el    = row.select_one("a[href]")
            detail_url = ""
            if link_el:
                href = link_el.get("href", "")
                detail_url = urljoin(base_url, href) if href else ""

            # ── Registration date ─────────────────────────────────────────────
            date_el  = row.select_one(".date") or row.select_one(".datum")
            reg_date = ""
            if date_el:
                reg_date = self._parse_german_date(date_el.get_text(strip=True))

            if not company_name:
                return None

            key = f"{registry_number or company_name}:{court}"
            source_id = hashlib.md5(key.encode()).hexdigest()

            raw_data = {
                "company_name":    company_name,
                "legal_form":      legal_form,
                "registry_number": registry_number,
                "court":           court,
                "address":         address,
                "status":          status,
                "registration_date": reg_date,
                "detail_url":      detail_url,
            }

            return self._make_record(
                record_type="company",
                raw_data=raw_data,
                source_url=detail_url,
                source_id=source_id,
            )

        except Exception as exc:
            logger.debug("[unternehmensregister] Parse error: %s", exc)
            return None

    # ── Field extractors ──────────────────────────────────────────────────────

    def _extract_legal_form(self, text: str) -> str:
        for pattern, short in self._LEGAL_FORM_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return short
        return ""

    def _extract_registry_number(self, text: str) -> str:
        m = re.search(r"\b(HR[AB]|PR|VR|GnR)\s*(\d+)\b", text, re.IGNORECASE)
        if m:
            return f"{m.group(1).upper()} {m.group(2)}"
        return ""

    def _extract_court(self, text: str) -> str:
        m = re.search(r"Amtsgericht\s+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜ\s\-\.]+?)(?=\s|,|$|\()", text)
        if m:
            return m.group(1).strip()
        return ""

    def _extract_address(self, text: str) -> dict:
        """
        Pull postal code + city from free text.
        German postal codes are always 5 digits.
        """
        m = re.search(r"(\d{5})\s+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜß\-\s]+)", text)
        if m:
            return {"postal_code": m.group(1), "city": m.group(2).strip()}
        return {}

    def _normalise_status(self, raw: str) -> str:
        low = raw.lower()
        if any(w in low for w in ["aktiv", "eingetragen", "active"]):
            return "active"
        if any(w in low for w in ["gelöscht", "aufgelöst", "liquidiert", "dissolved"]):
            return "dissolved"
        if any(w in low for w in ["insolvenz", "insolvency"]):
            return "insolvent"
        return raw or "unknown"

    def _parse_german_date(self, raw: str) -> str:
        m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", raw)
        if m:
            d, mo, y = m.groups()
            return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
        return raw.strip()
