"""
pipeline/connectors/bundesanzeiger.py
──────────────────────────────────────
Connector for the Bundesanzeiger (Federal Gazette) — Germany's official
publication platform for corporate filings.

What this connector retrieves:
  • Annual accounts (Jahresabschlüsse)
  • Mandatory disclosures (Pflichtveröffentlichungen)
  • Ad-hoc announcements (Bekanntmachungen)

Legal / ToS notes:
  • Bundesanzeiger is a public legal notice platform — data is publicly
    accessible and the underlying legislation (HGB §325) mandates
    publication for the purpose of public inspection.
  • We respect robots.txt and rate-limit to 1 req/s.
  • We do NOT create an account, bypass any authentication, or use
    undocumented APIs.
  • We only parse metadata (company name, date, filing type, registry
    number). PDF download is handled by the retrieval engine separately
    and only for companies that pass acquisition filters.

API used: the public search endpoint at
  https://www.bundesanzeiger.de/pub/de/suche?q=<keyword>&fts=true
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup

from .base import BaseConnector, RawRecord

logger = logging.getLogger(__name__)


class BundesanzeigerConnector(BaseConnector):
    """Scrapes public search results from Bundesanzeiger.de."""

    SOURCE_NAME = "bundesanzeiger"

    # ── Filing type mapping ────────────────────────────────────────────────────

    _FILING_TYPE_MAP: dict[str, str] = {
        "jahresabschluss":        "annual_accounts",
        "jahresbericht":          "annual_report",
        "lagebericht":            "management_report",
        "bekanntmachung":         "announcement",
        "kapitalmarktinformation": "capital_market_info",
        "insolvenz":              "insolvency",
        "liquidation":            "liquidation",
        "rechnungslegung":        "financial_statements",
        "offenlegung":            "disclosure",
    }

    # ── Public entry point ─────────────────────────────────────────────────────

    async def fetch(
        self,
        query: str | None = None,
        since: datetime | None = None,
        max_pages: int = 5,
        **kwargs,
    ) -> list[RawRecord]:
        """
        Search Bundesanzeiger for filings matching `query`.

        Args:
            query:     Company name or keyword (German preferred)
            since:     Only return filings published after this date
            max_pages: Cap on how many result pages to fetch (safety limit)

        Returns:
            list of RawRecord with record_type = "filing"
        """
        if not query:
            query = "GmbH"   # broad fallback — useful for scheduled sweeps

        logger.info("[bundesanzeiger] Searching: %r (since=%s)", query, since)

        records: list[RawRecord] = []
        base_url  = self._cfg.get("base_url", "https://www.bundesanzeiger.de")
        search_path = self._cfg.get("search_path", "/pub/de/suche")

        for page in range(max_pages):
            url = self._build_search_url(base_url, search_path, query, page)
            logger.debug("[bundesanzeiger] Fetching page %d: %s", page, url)

            try:
                resp = await self._get(url)
            except PermissionError as exc:
                logger.warning("[bundesanzeiger] Skipping URL (robots): %s", exc)
                break
            except Exception as exc:
                logger.error("[bundesanzeiger] HTTP error on page %d: %s", page, exc)
                break

            soup = BeautifulSoup(resp.text, "lxml")
            page_records = self._parse_search_page(soup, base_url)

            if not page_records:
                logger.debug("[bundesanzeiger] No more results at page %d", page)
                break

            # Filter by date if requested
            if since:
                page_records = [
                    r for r in page_records
                    if self._filing_after(r, since)
                ]
                if not page_records:
                    # All remaining results are older — stop paging
                    break

            records.extend(page_records)
            logger.info("[bundesanzeiger] Page %d → %d records (total %d)",
                        page, len(page_records), len(records))

        logger.info("[bundesanzeiger] Search %r completed: %d filings", query, len(records))
        return records

    async def fetch_new_filings(self, since: datetime | None = None) -> list[RawRecord]:
        """
        Scheduled job entry point — fetch recently published filings.
        Uses a broad search and filters by publication date.
        """
        # Broad search terms to catch most filings
        broad_queries = ["GmbH", "AG", "GmbH & Co.", "UG"]
        all_records: list[RawRecord] = []
        seen: set[str] = set()

        for q in broad_queries:
            recs = await self.fetch(query=q, since=since, max_pages=3)
            for r in recs:
                if r.dedup_key not in seen:
                    seen.add(r.dedup_key)
                    all_records.append(r)

        return all_records

    # ── URL builder ───────────────────────────────────────────────────────────

    def _build_search_url(
        self, base_url: str, path: str, query: str, page: int
    ) -> str:
        encoded = quote_plus(query)
        offset  = page * 10
        return f"{base_url}{path}?q={encoded}&fts=true&result_start={offset}"

    # ── Page parser ───────────────────────────────────────────────────────────

    def _parse_search_page(
        self, soup: BeautifulSoup, base_url: str
    ) -> list[RawRecord]:
        """
        Parse a Bundesanzeiger search result page into RawRecord list.

        The DOM structure targets the public search results — if BA changes
        their layout, update the selectors here without touching anything else.
        """
        records: list[RawRecord] = []

        # BA search results are in .result_container or table rows
        # Try multiple selector patterns to be resilient to minor HTML changes
        result_rows = (
            soup.select("table.result_container tr.result")
            or soup.select("div.result_entry")
            or soup.select(".suchergebnis-eintrag")
        )

        if not result_rows:
            # Fallback: look for any structured list items
            result_rows = soup.select("ul.results li") or []

        for row in result_rows:
            rec = self._parse_result_row(row, base_url)
            if rec:
                records.append(rec)

        return records

    def _parse_result_row(
        self, row: Any, base_url: str
    ) -> RawRecord | None:
        """Extract structured data from one search result row."""
        try:
            # ── Company name ─────────────────────────────────────────────────
            name_el = (
                row.select_one(".company_name")
                or row.select_one(".firma")
                or row.select_one("td.col_firma")
                or row.select_one("strong")
            )
            company_name = name_el.get_text(strip=True) if name_el else ""

            # ── Publication date ──────────────────────────────────────────────
            date_el = (
                row.select_one(".publication_date")
                or row.select_one(".datum")
                or row.select_one("td.col_datum")
            )
            pub_date_raw = date_el.get_text(strip=True) if date_el else ""
            pub_date_iso = self._parse_german_date(pub_date_raw)

            # ── Filing category / type ─────────────────────────────────────────
            cat_el = (
                row.select_one(".category")
                or row.select_one(".kategorie")
                or row.select_one("td.col_kategorie")
            )
            category_raw = cat_el.get_text(strip=True) if cat_el else ""
            filing_type  = self._map_filing_type(category_raw)

            # ── Anchor / detail URL ───────────────────────────────────────────
            link_el = row.select_one("a[href]")
            detail_url = ""
            if link_el:
                href = link_el.get("href", "")
                detail_url = urljoin(base_url, href) if href else ""

            # ── Registry number (if present in row text) ──────────────────────
            full_text   = row.get_text(" ", strip=True)
            registry_no = self._extract_registry_number(full_text)

            if not company_name and not detail_url:
                return None

            # Build a stable source_id from name + date + type
            raw_id = f"{company_name}:{pub_date_iso}:{filing_type}"
            source_id = hashlib.md5(raw_id.encode()).hexdigest()

            raw_data: dict = {
                "company_name":  company_name,
                "pub_date":      pub_date_iso,
                "pub_date_raw":  pub_date_raw,
                "category_raw":  category_raw,
                "filing_type":   filing_type,
                "detail_url":    detail_url,
                "registry_no":   registry_no,
            }

            return self._make_record(
                record_type="filing",
                raw_data=raw_data,
                source_url=detail_url,
                source_id=source_id,
            )

        except Exception as exc:
            logger.debug("[bundesanzeiger] Failed to parse row: %s", exc)
            return None

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _parse_german_date(self, raw: str) -> str:
        """Convert 'dd.mm.yyyy' or 'dd. Month yyyy' → ISO 8601."""
        if not raw:
            return ""
        # dd.mm.yyyy
        m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", raw)
        if m:
            d, mo, y = m.groups()
            return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
        # yyyy-mm-dd (already ISO)
        if re.match(r"\d{4}-\d{2}-\d{2}", raw):
            return raw[:10]
        return raw.strip()

    def _map_filing_type(self, category: str) -> str:
        """Map German category text to our normalised filing_type enum."""
        cat_lower = category.lower()
        for keyword, ftype in self._FILING_TYPE_MAP.items():
            if keyword in cat_lower:
                return ftype
        return "other"

    def _extract_registry_number(self, text: str) -> str:
        """Pull HRB/HRA/PR number from free text."""
        m = re.search(r"\b(HR[AB]|PR)\s*(\d+)\b", text, re.IGNORECASE)
        if m:
            return f"{m.group(1).upper()} {m.group(2)}"
        return ""

    def _filing_after(self, record: RawRecord, since: datetime) -> bool:
        """Return True if the filing's pub_date is after `since`."""
        pub_date = record.raw_data.get("pub_date", "")
        if not pub_date:
            return True  # include if unknown
        try:
            filing_dt = datetime.fromisoformat(pub_date).replace(tzinfo=timezone.utc)
            return filing_dt > since
        except ValueError:
            return True
