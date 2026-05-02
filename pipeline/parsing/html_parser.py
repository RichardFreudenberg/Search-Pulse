"""
pipeline/parsing/html_parser.py
─────────────────────────────────
Extracts structured company data from HTML pages returned by
Bundesanzeiger, Unternehmensregister, and Handelsregister.

Responsibilities:
  • Parse search result pages into company metadata dicts
  • Parse company detail pages into rich structured data
  • Handle multiple page layouts (they change over time)

Design:
  Selectors are kept in class-level dicts so they can be updated
  without touching the extraction logic.  Each source has its own
  selector map; _extract() tries them in order and takes the first hit.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)


# ─── Field selector maps ─────────────────────────────────────────────────────

_BA_SELECTORS: dict[str, list[str]] = {
    "company_name": [
        ".company_name", ".firma", "td.col_firma", "h1.title", "strong.name"
    ],
    "pub_date": [
        ".publication_date", ".datum", "td.col_datum", ".published-at"
    ],
    "category": [
        ".category", ".kategorie", "td.col_kategorie", ".doc-type"
    ],
    "detail_link": ["a.detail-link", "a[href*='pub']", "td.col_firma a"],
}

_UR_SELECTORS: dict[str, list[str]] = {
    "company_name": [
        ".firmenname", ".company-name", "td.col-name",
        "a.result_link", "span.firm"
    ],
    "registry_number": [
        ".registernummer", ".registry-number", "td.col-regnr"
    ],
    "court": [
        ".amtsgericht", ".court", "td.col-court"
    ],
    "status": [
        ".status", ".firmenstatus", "td.col-status"
    ],
}

_HR_SELECTORS: dict[str, list[str]] = {
    "company_name": [
        "td.col_firma", ".firmenname", "strong.firma"
    ],
    "legal_form": [
        ".rechtsform", ".legal-form", "td.col_rechtsform"
    ],
    "address": [
        ".adresse", ".address", "td.col_adresse"
    ],
}


class HTMLParser:
    """
    Parses HTML from German company registry portals.
    Instantiate once and reuse across many pages.
    """

    def parse(self, html: str, source: str, page_type: str = "search") -> list[dict]:
        """
        Main entry point.

        Args:
            html:      Raw HTML string
            source:    "bundesanzeiger" | "unternehmensregister" | "handelsregister"
            page_type: "search" | "detail"

        Returns:
            List of extracted record dicts (one per company/filing row)
        """
        soup = BeautifulSoup(html, "lxml")

        if source == "bundesanzeiger":
            return self._parse_ba(soup, page_type)
        if source == "unternehmensregister":
            return self._parse_ur(soup, page_type)
        if source == "handelsregister":
            return self._parse_hr(soup, page_type)

        logger.warning("[html_parser] Unknown source: %s", source)
        return []

    # ── Bundesanzeiger ────────────────────────────────────────────────────────

    def _parse_ba(self, soup: BeautifulSoup, page_type: str) -> list[dict]:
        if page_type == "detail":
            return [self._parse_ba_detail(soup)]

        rows = self._find_rows(soup, [
            "table.result_container tr.result",
            "div.result_entry",
            ".suchergebnis-eintrag",
            "ul.results li",
        ])
        return [r for r in (self._parse_ba_row(row) for row in rows) if r]

    def _parse_ba_row(self, row: Tag) -> dict | None:
        try:
            company_name = self._extract(row, _BA_SELECTORS["company_name"])
            pub_date_raw = self._extract(row, _BA_SELECTORS["pub_date"])
            category     = self._extract(row, _BA_SELECTORS["category"])
            link_el      = self._find_el(row, _BA_SELECTORS["detail_link"])
            detail_url   = link_el.get("href", "") if link_el else ""

            if not company_name:
                return None

            return {
                "company_name": company_name,
                "pub_date":     self._german_date(pub_date_raw),
                "pub_date_raw": pub_date_raw,
                "category":     category,
                "detail_url":   detail_url,
                "registry_no":  self._registry_number(row.get_text(" ")),
            }
        except Exception as exc:
            logger.debug("[html_parser] BA row error: %s", exc)
            return None

    def _parse_ba_detail(self, soup: BeautifulSoup) -> dict:
        """Parse a Bundesanzeiger detail page (one specific filing)."""
        text = soup.get_text(" ", strip=True)
        return {
            "company_name":  self._extract(soup, _BA_SELECTORS["company_name"]),
            "registry_no":   self._registry_number(text),
            "full_text":     text[:5000],          # first 5k chars for downstream LLM
            "tables":        self._extract_tables(soup),
        }

    # ── Unternehmensregister ──────────────────────────────────────────────────

    def _parse_ur(self, soup: BeautifulSoup, page_type: str) -> list[dict]:
        if page_type == "detail":
            return [self._parse_ur_detail(soup)]

        rows = self._find_rows(soup, [
            "table.result_list tr.row_data",
            "div.result-item",
            ".treffer",
        ])
        return [r for r in (self._parse_ur_row(row) for row in rows) if r]

    def _parse_ur_row(self, row: Tag) -> dict | None:
        try:
            company_name    = self._extract(row, _UR_SELECTORS["company_name"])
            registry_number = self._extract(row, _UR_SELECTORS["registry_number"])
            court           = self._extract(row, _UR_SELECTORS["court"])
            status_raw      = self._extract(row, _UR_SELECTORS["status"])

            if not company_name:
                text = row.get_text(" ", strip=True)
                if len(text) < 5:
                    return None
                company_name = text[:100]

            link_el    = row.select_one("a[href]")
            detail_url = link_el.get("href", "") if link_el else ""
            full_text  = row.get_text(" ", strip=True)

            if not registry_number:
                registry_number = self._registry_number(full_text)
            if not court:
                court = self._court_name(full_text)

            return {
                "company_name":    company_name,
                "registry_number": registry_number,
                "legal_form":      self._legal_form(company_name),
                "court":           court,
                "status":          self._normalise_status(status_raw),
                "address":         self._extract_address(full_text),
                "detail_url":      detail_url,
            }
        except Exception as exc:
            logger.debug("[html_parser] UR row error: %s", exc)
            return None

    def _parse_ur_detail(self, soup: BeautifulSoup) -> dict:
        """Parse a UR company detail page."""
        text = soup.get_text(" ", strip=True)
        return {
            "company_name":    self._extract(soup, _UR_SELECTORS["company_name"]),
            "registry_number": self._registry_number(text),
            "court":           self._court_name(text),
            "status":          self._normalise_status(""),
            "address":         self._extract_address(text),
            "tables":          self._extract_tables(soup),
        }

    # ── Handelsregister ───────────────────────────────────────────────────────

    def _parse_hr(self, soup: BeautifulSoup, page_type: str) -> list[dict]:
        rows = self._find_rows(soup, [
            "table.result_container tr.result",
            "table tr.datarow",
            ".suchergebnis",
        ])
        return [r for r in (self._parse_hr_row(row) for row in rows) if r]

    def _parse_hr_row(self, row: Tag) -> dict | None:
        try:
            company_name = self._extract(row, _HR_SELECTORS["company_name"])
            legal_form   = self._extract(row, _HR_SELECTORS["legal_form"])
            address_raw  = self._extract(row, _HR_SELECTORS["address"])
            full_text    = row.get_text(" ", strip=True)

            if not company_name:
                return None

            registry_no = self._registry_number(full_text)
            if not legal_form:
                legal_form = self._legal_form(company_name)
            status = "dissolved" if "gelöscht" in full_text.lower() else "active"

            return {
                "company_name":    company_name,
                "legal_form":      legal_form,
                "registry_number": registry_no,
                "court":           self._court_name(full_text),
                "status":          status,
                "address_raw":     address_raw,
                "address":         self._extract_address(full_text),
            }
        except Exception as exc:
            logger.debug("[html_parser] HR row error: %s", exc)
            return None

    # ── Shared helpers ────────────────────────────────────────────────────────

    def _find_rows(self, soup: BeautifulSoup, selectors: list[str]) -> list[Tag]:
        for sel in selectors:
            rows = soup.select(sel)
            if rows:
                return rows
        return []

    def _extract(self, node: Tag, selectors: list[str]) -> str:
        """Try each selector and return the first non-empty text match."""
        for sel in selectors:
            el = node.select_one(sel)
            if el:
                text = el.get_text(strip=True)
                if text:
                    return text
        return ""

    def _find_el(self, node: Tag, selectors: list[str]) -> Tag | None:
        for sel in selectors:
            el = node.select_one(sel)
            if el:
                return el
        return None

    def _german_date(self, raw: str) -> str:
        if not raw:
            return ""
        m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", raw.strip())
        if m:
            d, mo, y = m.groups()
            return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
        return raw.strip()

    def _registry_number(self, text: str) -> str:
        m = re.search(r"\b(HR[AB]|PR|VR|GnR)\s*(\d+)\b", text, re.IGNORECASE)
        return f"{m.group(1).upper()} {m.group(2)}" if m else ""

    def _court_name(self, text: str) -> str:
        m = re.search(r"Amtsgericht\s+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜ\s\-\.]+?)(?=\s|,|$|\()", text)
        return m.group(1).strip() if m else ""

    def _legal_form(self, name: str) -> str:
        patterns = [
            (r"GmbH\s*&\s*Co\.?\s*KG", "GmbH & Co. KG"),
            (r"\bGmbH\b", "GmbH"), (r"\bAG\b", "AG"),
            (r"\bKG\b", "KG"),    (r"\bOHG\b", "OHG"),
            (r"\bUG\b", "UG"),    (r"\be\.K\.", "e.K."),
        ]
        for pat, short in patterns:
            if re.search(pat, name, re.IGNORECASE):
                return short
        return ""

    def _normalise_status(self, raw: str) -> str:
        low = raw.lower()
        if any(w in low for w in ["aktiv", "eingetragen"]):
            return "active"
        if any(w in low for w in ["gelöscht", "aufgelöst", "liquidiert"]):
            return "dissolved"
        if "insolvenz" in low:
            return "insolvent"
        return "unknown"

    def _extract_address(self, text: str) -> dict:
        m = re.search(r"(\d{5})\s+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜß\-\s]+)", text)
        if m:
            return {"postal_code": m.group(1), "city": m.group(2).strip()}
        return {}

    def _extract_tables(self, soup: BeautifulSoup) -> list[list[list[str]]]:
        """Extract all HTML tables as a 3-level list [table][row][cell]."""
        tables = []
        for tbl in soup.find_all("table"):
            rows = []
            for tr in tbl.find_all("tr"):
                cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                if any(cells):
                    rows.append(cells)
            if rows:
                tables.append(rows)
        return tables
