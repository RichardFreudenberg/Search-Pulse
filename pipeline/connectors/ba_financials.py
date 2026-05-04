"""
pipeline/connectors/ba_financials.py
──────────────────────────────────────
Fetches annual accounts (Jahresabschlüsse) from Bundesanzeiger.de
for a specific company and extracts P&L financials.

Flow per company:
  1. Search Bundesanzeiger for the company name + "Jahresabschluss"
  2. Find the most recent annual accounts entry
  3. Download the document (PDF or HTML)
  4. Parse with PDFParser (regex) → fall back to LLMExtractor
  5. Return structured P&L dict

Output shape:
  {
    "fiscal_year":   2023,
    "revenue":       5_200_000.0,       # Umsatzerlöse
    "gross_profit":  2_100_000.0,       # Rohertrag (if available)
    "ebitda":        820_000.0,         # EBIT + Abschreibungen
    "ebit":          650_000.0,         # Betriebsergebnis
    "depreciation":  170_000.0,         # Abschreibungen
    "interest":     -45_000.0,          # Zinsergebnis (negative = expense)
    "ebt":           605_000.0,         # Ergebnis vor Steuern
    "taxes":        -180_000.0,
    "net_income":    425_000.0,         # Jahresüberschuss
    "employees":     38,
    "source_url":    "https://...",
    "data_quality":  "pdf_parsed",      # pdf_parsed | llm_extracted | partial
  }
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urljoin

logger = logging.getLogger(__name__)

# ─── Additional P&L patterns beyond what PDFParser already handles ─────────────

_EXTRA_PATTERNS: dict[str, list[str]] = {
    "gross_profit": [
        r"Rohertrag[:\s]+([0-9.,\sTEUR\-]+)",
        r"Bruttoergebnis[:\s]+([0-9.,\sTEUR\-]+)",
        r"Rohergebnis[:\s]+([0-9.,\sTEUR\-]+)",
    ],
    "depreciation": [
        r"Abschreibungen[:\s]+([0-9.,\sTEUR]+)",
        r"Abschreibung\s+auf[:\s]+([0-9.,\sTEUR]+)",
        r"planmäßige\s+Abschreibungen[:\s]+([0-9.,\sTEUR]+)",
    ],
    "ebit": [
        r"Betriebsergebnis[:\s]+([0-9.,\sTEUR\-]+)",
        r"EBIT[:\s]+([0-9.,\sTEUR\-]+)",
        r"Ergebnis\s+der\s+betrieblichen\s+Tätigkeit[:\s]+([0-9.,\sTEUR\-]+)",
    ],
    "interest": [
        r"Zinsergebnis[:\s]+([0-9.,\sTEUR\-]+)",
        r"Finanzergebnis[:\s]+([0-9.,\sTEUR\-]+)",
        r"Zinsen\s+und\s+ähnliche\s+Aufwendungen[:\s]+([0-9.,\sTEUR\-]+)",
    ],
    "ebt": [
        r"Ergebnis\s+vor\s+Steuern[:\s]+([0-9.,\sTEUR\-]+)",
        r"Ergebnis\s+vor\s+Ertragsteuern[:\s]+([0-9.,\sTEUR\-]+)",
        r"Vorsteuergewinn[:\s]+([0-9.,\sTEUR\-]+)",
    ],
    "taxes": [
        r"Ertragsteuern[:\s]+([0-9.,\sTEUR\-]+)",
        r"Steuern\s+vom\s+Einkommen[:\s]+([0-9.,\sTEUR\-]+)",
        r"Steueraufwand[:\s]+([0-9.,\sTEUR\-]+)",
    ],
    "personnel_costs": [
        r"Personalaufwand[:\s]+([0-9.,\sTEUR]+)",
        r"Löhne\s+und\s+Gehälter[:\s]+([0-9.,\sTEUR]+)",
    ],
}


def _parse_de_number(raw: str) -> float | None:
    """German number format → float. Handles negatives and TEUR."""
    raw = raw.strip().replace("\xa0", "").replace(" ", "")
    negative = raw.startswith("-") or raw.startswith("(")
    raw = raw.lstrip("-()").rstrip(")")
    raw = raw.replace(".", "").replace(",", ".")
    raw = re.sub(r"[€EURTeur]+$", "", raw).strip()
    try:
        val = float(raw)
        if "T" in raw.upper():
            val *= 1000
        return -val if negative else val
    except ValueError:
        return None


def _extract_extra_fields(text: str) -> dict:
    """Pull additional P&L lines from document text."""
    result = {}
    for field, patterns in _EXTRA_PATTERNS.items():
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
            if m:
                val = _parse_de_number(m.group(1))
                if val is not None:
                    result[field] = val
                    break
    return result


# ─── Main fetcher ─────────────────────────────────────────────────────────────

class BAFinancialsFetcher:
    """
    Fetches and parses Bundesanzeiger annual accounts for a company.
    Uses Playwright (headless Chromium) — already installed.
    """

    BA_BASE = "https://www.bundesanzeiger.de"

    def __init__(self) -> None:
        from pipeline.parsing.pdf_parser import PDFParser
        from pipeline.parsing.llm_extractor import LLMExtractor
        self._pdf_parser = PDFParser()
        self._llm        = LLMExtractor(max_chars=4000)

    async def fetch_financials(self, company_name: str, registry_number: str = "") -> dict | None:
        """
        Main entry point. Returns structured financials dict or None if not found.
        """
        logger.info("[ba_fin] Fetching financials for: %s", company_name)
        try:
            return await self._playwright_fetch(company_name, registry_number)
        except Exception as exc:
            logger.warning("[ba_fin] Failed for %s: %s", company_name, exc)
            return None

    async def _playwright_fetch(self, company_name: str, registry_number: str) -> dict | None:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("[ba_fin] Playwright not installed")
            return None

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="de-DE",
            )
            page = await ctx.new_page()

            try:
                result = await self._search_and_extract(page, company_name, registry_number)
            finally:
                await browser.close()

        return result

    async def _search_and_extract(self, page, company_name: str, registry_number: str) -> dict | None:
        """Navigate Bundesanzeiger, find annual accounts, extract financials."""

        # ── Step 1: Load search page ─────────────────────────────────────────
        search_url = f"{self.BA_BASE}/pub/de/suche?q={quote_plus(company_name)}&fts=true"
        logger.debug("[ba_fin] Loading: %s", search_url)

        try:
            await page.goto(search_url, wait_until="networkidle", timeout=60_000)
        except Exception:
            await page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)

        await page.wait_for_timeout(2_000)

        # ── Step 2: Dismiss cookie banner ────────────────────────────────────
        for sel in [
            "button:has-text('Nur technisch notwendige Cookies akzeptieren')",
            "button:has-text('Allen zustimmen')",
            "button:has-text('Akzeptieren')",
        ]:
            try:
                btn = page.locator(sel).first
                if await btn.is_visible(timeout=2_000):
                    await btn.click()
                    await page.wait_for_timeout(1_500)
                    break
            except Exception:
                continue

        # ── Step 3: Find Jahresabschluss entries ─────────────────────────────
        await page.wait_for_timeout(3_000)

        # Collect all result links that look like annual accounts
        links = await page.evaluate("""() => {
            const results = [];
            // Try structured result rows first
            const rows = document.querySelectorAll(
                'table.result_container tr, .result-list .result-item, .treffer, article'
            );
            rows.forEach(row => {
                const text = row.innerText || '';
                const isAnnual = /jahresabschluss|jahresbericht|jahresabschluß/i.test(text);
                if (!isAnnual) return;
                const link = row.querySelector('a[href]');
                if (link) {
                    results.push({
                        href:  link.href,
                        text:  text.slice(0, 200),
                        year:  (text.match(/20[12][0-9]/) || [''])[0],
                    });
                }
            });
            return results;
        }""")

        if not links:
            # Fallback: scan all links on page for Jahresabschluss keywords
            links = await page.evaluate("""() => {
                const results = [];
                document.querySelectorAll('a[href]').forEach(a => {
                    const txt = (a.innerText || a.textContent || '').trim();
                    if (/jahresabschluss|jahresbericht/i.test(txt) || /jahresabschluss/i.test(a.href)) {
                        results.push({ href: a.href, text: txt, year: (txt.match(/20[12][0-9]/) || [''])[0] });
                    }
                });
                return results;
            }""")

        # ── Filter out help / how-to / navigation pages that also contain
        # the word "Jahresabschluss" but aren't actual filings ─────────────
        BAD_URL_PATTERNS = (
            "howto-hinterlegen", "/howto/", "/hilfe/", "/info/", "/anleitung",
            "/kontakt", "/impressum", "/sitemap", "/themenwelten", "/suche",
        )
        links = [
            l for l in links
            if not any(pat in (l.get("href") or "").lower() for pat in BAD_URL_PATTERNS)
            # Also require a year in the link text — actual filings always show a year
            and l.get("year")
        ]

        if not links:
            logger.info("[ba_fin] No real Jahresabschluss filing found for: %s", company_name)
            return None

        # Pick the most recent year
        links.sort(key=lambda x: x.get("year", ""), reverse=True)
        best = links[0]
        source_url = best["href"]
        filing_year = int(best["year"]) if best.get("year") else None

        logger.info("[ba_fin] Found filing (year=%s): %s", filing_year, source_url[:80])

        # ── Step 4: Navigate to the filing detail page ───────────────────────
        try:
            await page.goto(source_url, wait_until="networkidle", timeout=30_000)
        except Exception:
            await page.goto(source_url, wait_until="domcontentloaded", timeout=20_000)
        await page.wait_for_timeout(2_000)

        # ── Step 5: Try to get the document — PDF download or HTML text ───────
        pdf_bytes = await self._try_download_pdf(page, source_url)

        if pdf_bytes:
            logger.info("[ba_fin] Downloaded PDF (%d bytes) for %s", len(pdf_bytes), company_name)
            parsed = self._pdf_parser.parse_bytes(pdf_bytes, f"{company_name}.pdf")
            quality = "pdf_parsed"
        else:
            # Extract text from the rendered HTML page as fallback
            page_text = await page.evaluate("() => document.body.innerText")
            logger.info("[ba_fin] Using HTML text (%d chars) for %s", len(page_text), company_name)
            parsed = self._pdf_parser._extract_fields(page_text, company_name)
            quality = "html_parsed"

        # ── Step 6: Supplement with extra P&L patterns ────────────────────────
        if pdf_bytes:
            import io as _io
            try:
                import pdfplumber
                with pdfplumber.open(_io.BytesIO(pdf_bytes)) as pdf:
                    full_text = "\n\n".join(
                        p.extract_text(x_tolerance=3, y_tolerance=3) or ""
                        for p in pdf.pages
                    )
            except Exception:
                full_text = ""
        else:
            full_text = await page.evaluate("() => document.body.innerText")

        extra = _extract_extra_fields(full_text) if full_text else {}

        # ── Step 7: LLM fallback if very little was extracted ────────────────
        key_fields = {"revenue", "net_profit", "net_income"}
        got_fields = set(parsed.keys()) | set(extra.keys())
        if not (key_fields & got_fields) and full_text:
            logger.info("[ba_fin] Regex extraction thin — trying LLM for %s", company_name)
            llm_result = self._llm.extract(full_text[:4000])
            if llm_result:
                # Merge LLM results in
                for k, v in llm_result.items():
                    if v is not None and k not in parsed:
                        parsed[k] = v
                quality = "llm_extracted"

        # ── Step 8: Normalise into standard P&L shape ────────────────────────
        return self._normalise(parsed, extra, filing_year, source_url, quality)

    async def _try_download_pdf(self, page, source_url: str) -> bytes | None:
        """Try to find and download a PDF from the current page."""
        # Look for a direct PDF link
        pdf_url = await page.evaluate("""() => {
            const links = Array.from(document.querySelectorAll('a[href]'));
            const pdf = links.find(a =>
                a.href.endsWith('.pdf') ||
                /download.*pdf|pdf.*download/i.test(a.href) ||
                /pdf/i.test(a.innerText)
            );
            return pdf ? pdf.href : null;
        }""")

        if not pdf_url:
            return None

        try:
            import httpx
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(pdf_url, headers={
                    "User-Agent": "Mozilla/5.0 (compatible; SearchPulseCRM/1.0)"
                })
                if resp.status_code == 200 and b"%PDF" in resp.content[:10]:
                    return resp.content
        except Exception as exc:
            logger.debug("[ba_fin] PDF download failed: %s", exc)

        return None

    def _normalise(
        self,
        parsed: dict,
        extra: dict,
        filing_year: int | None,
        source_url: str,
        quality: str,
    ) -> dict:
        """
        Merge parsed + extra into a clean international P&L dict.
        Calculates derived metrics (EBITDA, EBIT margin, etc.)
        """
        def _get(*keys: str) -> float | None:
            for k in keys:
                v = extra.get(k) or parsed.get(k)
                if v is not None:
                    return float(v)
            return None

        revenue       = _get("revenue", "revenue_eur")
        gross_profit  = _get("gross_profit")
        ebit          = _get("ebit", "ebitda_proxy")
        depreciation  = _get("depreciation")
        interest      = _get("interest")
        ebt           = _get("ebt")
        taxes         = _get("taxes")
        net_income    = _get("net_income", "net_profit", "net_profit_eur")
        employees     = _get("employees")
        fiscal_year   = _get("fiscal_year") or filing_year

        # Derive EBITDA = EBIT + D&A if we have both
        ebitda = None
        if ebit is not None and depreciation is not None:
            ebitda = ebit + depreciation
        elif _get("ebitda_proxy"):
            ebitda = _get("ebitda_proxy")

        # Derive EBT = EBIT + interest if missing
        if ebt is None and ebit is not None and interest is not None:
            ebt = ebit + interest

        # Derive net income from EBT + taxes if missing
        if net_income is None and ebt is not None and taxes is not None:
            net_income = ebt - abs(taxes)

        result = {
            "fiscal_year":    int(fiscal_year) if fiscal_year else None,
            "revenue":        revenue,
            "gross_profit":   gross_profit,
            "ebitda":         ebitda,
            "ebit":           ebit,
            "depreciation":   depreciation,
            "interest":       interest,
            "ebt":            ebt,
            "taxes":          taxes,
            "net_income":     net_income,
            "employees":      int(employees) if employees else None,
            "source_url":     source_url,
            "data_quality":   quality,
        }

        # Compute margins if revenue is known
        if revenue and revenue > 0:
            if ebitda is not None:
                result["ebitda_margin_pct"] = round(ebitda / revenue * 100, 1)
            if net_income is not None:
                result["net_margin_pct"] = round(net_income / revenue * 100, 1)

        # Strip None values for clean storage
        return {k: v for k, v in result.items() if v is not None}
