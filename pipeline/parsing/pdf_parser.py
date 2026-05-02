"""
pipeline/parsing/pdf_parser.py
────────────────────────────────
Extracts structured data from German corporate filing PDFs.

Primary tool: pdfplumber (deterministic, no cloud calls)
Fallback:     PyMuPDF (handles encrypted / malformed PDFs)
Final fallback: LLM extraction (for scanned / messy documents)

Extracted fields:
  • Company name and legal form
  • Registry number (HRB/HRA)
  • Financial year
  • Revenue (Umsatz / Umsatzerlöse)
  • EBITDA proxy (Ergebnis vor Zinsen und Steuern)
  • Net profit (Jahresüberschuss / Jahresfehlbetrag)
  • Employee count (Mitarbeiter / Arbeitnehmer)
  • Managing directors
  • Shareholder list (if in the document)
  • Business purpose (Unternehmensgegenstand)
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ─── German number normaliser ─────────────────────────────────────────────────
# German: 1.234.567,89  →  Python float: 1234567.89

def _parse_german_number(raw: str) -> float | None:
    """Convert a German-formatted number string to float."""
    raw = raw.strip().replace("\xa0", "").replace(" ", "")
    # Remove thousands separator (dot) and convert decimal comma
    cleaned = raw.replace(".", "").replace(",", ".")
    # Strip trailing currency codes or labels
    cleaned = re.sub(r"[€TEUR]+$", "", cleaned, flags=re.IGNORECASE).strip()
    try:
        val = float(cleaned)
        # If original contained "T" prefix it's in thousands
        if "T" in raw.upper() and "TEUR" in raw.upper():
            val *= 1000
        return val
    except ValueError:
        return None


# ─── Main parser class ────────────────────────────────────────────────────────

class PDFParser:
    """
    Extracts structured financial and company data from German filing PDFs.
    """

    # Patterns keyed on the canonical field name
    _PATTERNS: dict[str, list[str]] = {
        "revenue": [
            r"Umsatzerlöse[:\s]+([0-9.,\sTEUR]+)",
            r"Umsatz[:\s]+([0-9.,\sTEUR]+)",
            r"Gesamtleistung[:\s]+([0-9.,\sTEUR]+)",
        ],
        "net_profit": [
            r"Jahresüberschuss[:\s]+([0-9.,\sTEUR]+)",
            r"Jahresfehlbetrag[:\s]+\-?\s*([0-9.,\sTEUR]+)",
            r"Jahresergebnis[:\s]+([0-9.,\sTEUR]+)",
        ],
        "ebitda_proxy": [
            r"EBITDA[:\s]+([0-9.,\sTEUR]+)",
            r"Betriebsergebnis[:\s]+([0-9.,\sTEUR]+)",
            r"Ergebnis\s+der\s+gewöhnlichen\s+Geschäftstätigkeit[:\s]+([0-9.,\sTEUR]+)",
        ],
        "employees": [
            r"Mitarbeiter[:\s]+([0-9.]+)",
            r"Arbeitnehmer[:\s]+([0-9.]+)",
            r"Beschäftigte[:\s]+([0-9.]+)",
            r"durchschnittlich\s+(\d+)\s+Arbeitnehmer",
        ],
        "fiscal_year": [
            r"Geschäftsjahr\s+(\d{4})",
            r"Berichtsjahr\s+(\d{4})",
            r"für\s+das\s+Jahr\s+(\d{4})",
            r"(?:0?1\.0?1\.|01\.0?1\.)(\d{4})",   # "01.01.2023"
        ],
        "registry_number": [
            r"\b(HR[AB])\s*(\d+)\b",
            r"Registernummer[:\s]+([A-Z]+\s*\d+)",
        ],
        "company_name": [
            r"^([A-ZÄÖÜ].+?(?:GmbH|AG|KG|OHG|UG|e\.K\.)[\w\s&.,-]*)",
        ],
        "purpose": [
            r"Unternehmensgegenstand[:\s]+(.{20,500}?)(?=\n\n|\Z)",
            r"Gegenstand\s+des\s+Unternehmens[:\s]+(.{20,500}?)(?=\n\n|\Z)",
        ],
    }

    # Director capture
    _DIRECTOR_PATTERNS = [
        r"Geschäftsführer[:\s]+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜß\-\s,]+?)(?=\n|;|$)",
        r"Prokurist[:\s]+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜß\-\s,]+?)(?=\n|;|$)",
        r"Vorstand[:\s]+([A-ZÄÖÜ][a-zäöüA-ZÄÖÜß\-\s,]+?)(?=\n|;|$)",
    ]

    def parse_bytes(self, data: bytes, filename: str = "") -> dict:
        """
        Parse PDF from raw bytes.  Returns structured extraction dict.
        """
        text = self._extract_text(data)
        if not text:
            logger.warning("[pdf] No text extracted from %s — possibly scanned", filename)
            return {"_error": "no_text", "filename": filename}

        return self._extract_fields(text, filename)

    def parse_file(self, path: str | Path) -> dict:
        """Parse a PDF from disk."""
        path = Path(path)
        data = path.read_bytes()
        return self.parse_bytes(data, path.name)

    # ── Text extraction ───────────────────────────────────────────────────────

    def _extract_text(self, data: bytes) -> str:
        """Try pdfplumber first, fall back to PyMuPDF."""
        text = self._extract_pdfplumber(data)
        if not text or len(text.strip()) < 100:
            text = self._extract_pymupdf(data)
        return text or ""

    def _extract_pdfplumber(self, data: bytes) -> str:
        try:
            import pdfplumber
        except ImportError:
            return ""
        try:
            pages: list[str] = []
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                for page in pdf.pages:
                    t = page.extract_text(x_tolerance=3, y_tolerance=3)
                    if t:
                        pages.append(t)
            return "\n\n".join(pages)
        except Exception as exc:
            logger.debug("[pdf] pdfplumber failed: %s", exc)
            return ""

    def _extract_pymupdf(self, data: bytes) -> str:
        try:
            import fitz  # PyMuPDF
        except ImportError:
            return ""
        try:
            doc   = fitz.open(stream=data, filetype="pdf")
            pages = [doc.load_page(i).get_text("text") for i in range(len(doc))]
            return "\n\n".join(pages)
        except Exception as exc:
            logger.debug("[pdf] PyMuPDF failed: %s", exc)
            return ""

    # ── Field extraction ──────────────────────────────────────────────────────

    def _extract_fields(self, text: str, filename: str) -> dict:
        """Apply all pattern extractors to the full document text."""
        result: dict = {
            "filename":        filename,
            "text_length":     len(text),
            "page_hash":       hashlib.md5(text[:2000].encode()).hexdigest(),
        }

        # Numeric fields
        for field in ("revenue", "net_profit", "ebitda_proxy"):
            val = self._find_number(text, self._PATTERNS[field])
            if val is not None:
                result[field] = val

        # Integer fields
        employees = self._find_number(text, self._PATTERNS["employees"])
        if employees is not None:
            result["employees"] = int(employees)

        # Year
        fy = self._find_first(text, self._PATTERNS["fiscal_year"])
        if fy:
            result["fiscal_year"] = int(fy)

        # Registry number
        rn = self._find_registry_number(text)
        if rn:
            result["registry_number"] = rn

        # Company name
        name = self._find_first(text[:500], self._PATTERNS["company_name"])
        if name:
            result["company_name"] = name.strip()

        # Business purpose
        purpose = self._find_first(text, self._PATTERNS["purpose"])
        if purpose:
            result["business_purpose"] = purpose.strip()[:500]

        # Directors
        directors = self._find_directors(text)
        if directors:
            result["directors"] = directors

        return result

    # ── Pattern helpers ───────────────────────────────────────────────────────

    def _find_first(self, text: str, patterns: list[str]) -> str:
        """Return the first match group from any pattern."""
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
            if m:
                return m.group(1).strip()
        return ""

    def _find_number(self, text: str, patterns: list[str]) -> float | None:
        """Return the first successfully parsed number."""
        raw = self._find_first(text, patterns)
        if raw:
            return _parse_german_number(raw)
        return None

    def _find_registry_number(self, text: str) -> str:
        for pat in self._PATTERNS["registry_number"]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                if m.lastindex and m.lastindex >= 2:
                    return f"{m.group(1).upper()} {m.group(2)}"
                return m.group(1).strip()
        return ""

    def _find_directors(self, text: str) -> list[dict]:
        """Extract director names and roles from text."""
        directors: list[dict] = []
        seen: set[str] = set()

        for pat in self._DIRECTOR_PATTERNS:
            role_match = re.match(r"(\w+)[:\s]", pat)
            role = role_match.group(1) if role_match else "unknown"

            for m in re.finditer(pat, text, re.IGNORECASE):
                raw_names = m.group(1).strip()
                # Split multiple directors separated by comma or semicolon
                for name in re.split(r"[,;]", raw_names):
                    name = name.strip()
                    if name and len(name) > 3 and name not in seen:
                        seen.add(name)
                        directors.append({"name": name, "role": role})

        return directors
