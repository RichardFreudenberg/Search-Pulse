"""
pipeline/connectors/handelsregister.py
────────────────────────────────────────
Connector for Handelsregister.de — the official German commercial register.

⚠️  IMPORTANT — Legal / ToS constraints:
  • Handelsregister.de explicitly prohibits automated bulk access in its ToS.
  • This connector is METADATA ONLY and is limited to point lookups by
    registry number (not bulk enumeration).
  • We enforce: metadata_only = True, rate_limit_rps = 0.3.
  • ALL document retrieval goes through the Unternehmensregister or
    Bundesanzeiger connector — NOT this one.
  • This connector exists solely to resolve a registry number → latest
    status/court/name when the other sources don't have fresh data.

Primary use case:
  • Confirm that a company from Unternehmensregister is still active
  • Resolve the canonical name and court after a name change
  • Pull the latest registered address for a known company number

Implementation note:
  The HR portal uses session-based navigation. We use Playwright in headless
  mode when a session cookie is required. For simple GET-accessible endpoints
  we use httpx. The connector falls back to httpx by default; set
  use_playwright: true in config if Playwright is needed.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup

from .base import BaseConnector, RawRecord

logger = logging.getLogger(__name__)

# Mapping: state code → Amtsgericht identifier used by HR portal
_STATE_TO_COURT_PREFIX: dict[str, str] = {
    "BW": "Baden-Württemberg",
    "BY": "Bayern",
    "BE": "Berlin",
    "BB": "Brandenburg",
    "HB": "Bremen",
    "HH": "Hamburg",
    "HE": "Hessen",
    "MV": "Mecklenburg-Vorpommern",
    "NI": "Niedersachsen",
    "NW": "Nordrhein-Westfalen",
    "RP": "Rheinland-Pfalz",
    "SL": "Saarland",
    "SN": "Sachsen",
    "ST": "Sachsen-Anhalt",
    "SH": "Schleswig-Holstein",
    "TH": "Thüringen",
}


class HandelsregisterConnector(BaseConnector):
    """
    Point-lookup connector for Handelsregister.de.
    Only performs individual lookups — NEVER enumerates or bulk-scrapes.
    """

    SOURCE_NAME = "handelsregister"

    def __init__(self, cfg: dict, queue: Any = None) -> None:
        # Enforce conservative rate limiting
        cfg.setdefault("rate_limit_rps", 0.3)
        cfg.setdefault("metadata_only", True)
        super().__init__(cfg, queue)
        self._use_playwright = cfg.get("use_playwright", False)

    # ── Public entry point ─────────────────────────────────────────────────────

    async def fetch(
        self,
        query: str | None = None,
        since: datetime | None = None,
        **kwargs,
    ) -> list[RawRecord]:
        """
        Generic fetch — wraps lookup_by_number for compatibility.
        `query` must be a registry number (e.g. "HRB 12345") or
        "HRB 12345 Amtsgericht München".
        """
        if not query:
            logger.warning("[handelsregister] fetch() called with no query — skipping")
            return []

        rec = await self.lookup_by_number(query)
        return [rec] if rec else []

    async def lookup_by_number(
        self,
        registry_number: str,
        court: str = "",
        state_code: str = "",
    ) -> RawRecord | None:
        """
        Retrieve metadata for a single company by its registry number.

        Args:
            registry_number: e.g. "HRB 66773" or "HRB66773"
            court:           Amtsgericht city, e.g. "Köln"
            state_code:      2-letter state code, e.g. "NW"

        Returns:
            RawRecord or None if not found
        """
        if self._cfg.get("metadata_only", True):
            logger.debug("[handelsregister] Metadata-only lookup: %s %s", registry_number, court)

        # Normalise registry number
        clean_rn = re.sub(r"\s+", " ", registry_number.strip().upper())
        m = re.match(r"(HR[AB]|PR|VR)\s*(\d+)", clean_rn)
        if not m:
            logger.warning("[handelsregister] Invalid registry number: %r", registry_number)
            return None

        reg_type   = m.group(1)   # "HRB" | "HRA"
        reg_number = m.group(2)

        # Build the lookup URL for the HR public search
        base_url = self._cfg.get("base_url", "https://www.handelsregister.de")
        url = self._build_lookup_url(base_url, reg_type, reg_number, court)

        try:
            if self._use_playwright:
                raw_data = await self._playwright_lookup(url, reg_type, reg_number, court)
            else:
                raw_data = await self._http_lookup(url, reg_type, reg_number, court)
        except PermissionError as exc:
            logger.warning("[handelsregister] robots.txt blocked: %s", exc)
            return None
        except Exception as exc:
            logger.error("[handelsregister] Lookup failed for %s: %s", registry_number, exc)
            return None

        if not raw_data:
            return None

        source_id = hashlib.md5(f"{reg_type}{reg_number}{court}".encode()).hexdigest()
        return self._make_record(
            record_type="company",
            raw_data=raw_data,
            source_url=url,
            source_id=source_id,
        )

    # ── URL builder ───────────────────────────────────────────────────────────

    def _build_lookup_url(
        self, base: str, reg_type: str, reg_number: str, court: str
    ) -> str:
        """
        Build the public search URL for HR. This uses the keyword search
        endpoint (not the authenticated API).
        """
        from urllib.parse import quote_plus
        q = f"{reg_type} {reg_number}"
        if court:
            q += f" {court}"
        return f"{base}/rp_web/search.do?Typ=n&recherche=true&suchTyp=2&term={quote_plus(q)}"

    # ── HTTP lookup ───────────────────────────────────────────────────────────

    async def _http_lookup(
        self, url: str, reg_type: str, reg_number: str, court: str
    ) -> dict | None:
        """Simple HTTP GET + HTML parse (works for most HR lookups)."""
        resp = await self._get(url)
        soup = BeautifulSoup(resp.text, "lxml")
        return self._parse_hr_result(soup, reg_type, reg_number, court)

    # ── Playwright lookup ─────────────────────────────────────────────────────

    async def _playwright_lookup(
        self, url: str, reg_type: str, reg_number: str, court: str
    ) -> dict | None:
        """
        Browser-based lookup for pages that require JavaScript.
        Only used when use_playwright: true in config.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("[handelsregister] Playwright not installed — "
                         "run: pip install playwright && playwright install chromium")
            return None

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx     = await browser.new_context(
                user_agent=self._user_agent,
                locale="de-DE",
            )
            page = await ctx.new_page()

            try:
                await page.goto(url, timeout=30_000, wait_until="domcontentloaded")
                await page.wait_for_timeout(2_000)   # polite pause
                html = await page.content()
            finally:
                await browser.close()

        soup = BeautifulSoup(html, "lxml")
        return self._parse_hr_result(soup, reg_type, reg_number, court)

    # ── Result parser ─────────────────────────────────────────────────────────

    def _parse_hr_result(
        self,
        soup: BeautifulSoup,
        reg_type: str,
        reg_number: str,
        court: str,
    ) -> dict | None:
        """
        Parse HR search results HTML → structured dict.
        Returns None if no match found.
        """
        # Try multiple selector patterns for resilience
        rows = (
            soup.select("table.result_container tr.result")
            or soup.select("table tr.datarow")
            or soup.select(".suchergebnis")
        )

        if not rows:
            # Log page snippet for debugging
            logger.debug("[handelsregister] No result rows in HTML (len=%d)", len(soup.text))
            return None

        # Use the first matching row
        row = rows[0]
        text = row.get_text(" ", strip=True)

        # Company name
        name_el = (
            row.select_one("td.col_firma")
            or row.select_one(".firmenname")
            or row.select_one("strong")
        )
        company_name = name_el.get_text(strip=True) if name_el else ""

        # Status
        status_text = text.lower()
        if any(w in status_text for w in ["gelöscht", "aufgelöst"]):
            status = "dissolved"
        elif "insolvenz" in status_text:
            status = "insolvent"
        else:
            status = "active"

        # Legal form
        legal_form = self._extract_legal_form(company_name)

        # Address
        address = {}
        zip_m = re.search(r"(\d{5})\s+([A-ZÄÖÜ][a-zäöüß\s]+)", text)
        if zip_m:
            address = {"postal_code": zip_m.group(1), "city": zip_m.group(2).strip()}

        # Last update date
        date_m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", text)
        last_update = ""
        if date_m:
            d, mo, y = date_m.groups()
            last_update = f"{y}-{mo.zfill(2)}-{d.zfill(2)}"

        if not company_name:
            return None

        return {
            "company_name":    company_name,
            "registry_type":   reg_type,
            "registry_number": f"{reg_type} {reg_number}",
            "court":           court,
            "legal_form":      legal_form,
            "status":          status,
            "address":         address,
            "last_update":     last_update,
        }

    def _extract_legal_form(self, name: str) -> str:
        patterns = [
            (r"GmbH\s*&\s*Co\.?\s*KG", "GmbH & Co. KG"),
            (r"\bGmbH\b",              "GmbH"),
            (r"\bAG\b",               "AG"),
            (r"\bKG\b",               "KG"),
            (r"\bOHG\b",              "OHG"),
            (r"\bUG\b",               "UG"),
            (r"\be\.K\.",             "e.K."),
        ]
        for pat, short in patterns:
            if re.search(pat, name, re.IGNORECASE):
                return short
        return ""
