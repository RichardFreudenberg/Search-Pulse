"""
pipeline/retrieval/document_retriever.py
─────────────────────────────────────────
Smart document retrieval engine.

Responsibilities:
  • Evaluate whether a company passes the acquisition trigger rules
  • Check the document cache before making any network requests
  • Download and store filing PDFs
  • Pass downloaded documents to the parsing layer
  • Track costs per document fetch

Trigger rules are evaluated lazily — only companies matching the
configured acquisition_filters in pipeline.yaml generate a fetch job.
This keeps costs proportional to pipeline value, not raw volume.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class DocumentRetriever:
    """
    Downloads and caches filing documents from Bundesanzeiger and UR.

    Configuration keys (from retrieval section of pipeline.yaml):
      document_storage_path:     local directory for cached files
      cache_ttl_days:            how long to keep cached files
      max_cost_per_document_eur: hard limit per document
      trigger_rules:             list of filter rules
    """

    def __init__(self, cfg: dict) -> None:
        self._cfg      = cfg
        self._storage  = Path(cfg.get("document_storage_path", "./data/documents"))
        self._storage.mkdir(parents=True, exist_ok=True)
        self._max_cost = float(cfg.get("max_cost_per_document_eur", 2.50))
        self._cache_days = int(cfg.get("cache_ttl_days", 90))

    # ── Public interface ──────────────────────────────────────────────────────

    async def fetch(self, url: str, doc_type: str = "unknown") -> dict | None:
        """
        Fetch a document from `url`.  Returns a result dict or None on failure.

        Result dict:
            url, file_path, file_hash, pages, cost_eur, parsed (dict from PDF parser)
        """
        import httpx

        # Check cache first
        cached = self._cache_lookup(url)
        if cached:
            logger.info("[retrieval] Cache hit: %s", url[:60])
            return cached

        logger.info("[retrieval] Fetching %s (%s)", url[:60], doc_type)

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(60.0),
                follow_redirects=True,
                headers={"User-Agent": "SearchPulsePipeline/1.0"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()

            data        = resp.content
            content_type = resp.headers.get("content-type", "")

            file_hash = hashlib.sha256(data).hexdigest()
            file_path = self._storage / f"{file_hash[:16]}.{self._ext(content_type, url)}"
            file_path.write_bytes(data)

            # Parse the document
            parsed = self._parse_document(data, content_type, url)

            result = {
                "url":        url,
                "file_path":  str(file_path),
                "file_hash":  file_hash,
                "pages":      parsed.get("pages", 0),
                "cost_eur":   0.0,        # free tier — adjust if using paid service
                "parsed":     parsed,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }

            self._cache_store(url, result)
            return result

        except Exception as exc:
            logger.error("[retrieval] Fetch failed for %s: %s", url[:60], exc)
            return None

    def should_retrieve(self, company: dict) -> bool:
        """
        Evaluate trigger rules to decide if this company warrants
        paid document retrieval.

        Returns True if ALL rules pass (AND semantics).
        An empty rules list means all companies qualify.
        """
        rules = self._cfg.get("trigger_rules", [])
        if not rules:
            return True

        for rule in rules:
            field    = rule.get("field", "")
            operator = rule.get("operator", "==")
            value    = rule.get("value")
            actual   = company.get(field)

            if actual is None:
                # Missing field — can't satisfy the rule → skip
                continue

            if not self._evaluate_rule(actual, operator, value):
                return False

        return True

    # ── Trigger rule evaluator ────────────────────────────────────────────────

    def _evaluate_rule(self, actual: Any, operator: str, expected: Any) -> bool:
        try:
            if operator == ">=":
                return float(actual) >= float(expected)
            if operator == "<=":
                return float(actual) <= float(expected)
            if operator == ">":
                return float(actual) > float(expected)
            if operator == "<":
                return float(actual) < float(expected)
            if operator == "==":
                return str(actual) == str(expected)
            if operator == "!=":
                return str(actual) != str(expected)
            if operator == "in":
                return actual in (expected or [])
            if operator == "not_in":
                return actual not in (expected or [])
        except (TypeError, ValueError):
            return False
        return False

    # ── Document parsing ──────────────────────────────────────────────────────

    def _parse_document(self, data: bytes, content_type: str, url: str) -> dict:
        """Route to the appropriate parser based on content type."""
        try:
            if "pdf" in content_type.lower() or url.lower().endswith(".pdf"):
                from pipeline.parsing.pdf_parser import PDFParser
                parser = PDFParser()
                result = parser.parse_bytes(data)
                result["pages"] = self._count_pdf_pages(data)
                return result

            if "html" in content_type.lower():
                html = data.decode("utf-8", errors="replace")
                from pipeline.parsing.html_parser import HTMLParser
                parser = HTMLParser()
                rows   = parser.parse(html, source="bundesanzeiger", page_type="detail")
                return {"rows": rows, "pages": 1}

            return {"raw_bytes": len(data), "pages": 0}

        except Exception as exc:
            logger.warning("[retrieval] Parse error: %s", exc)
            return {"parse_error": str(exc), "pages": 0}

    def _count_pdf_pages(self, data: bytes) -> int:
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                return len(pdf.pages)
        except Exception:
            try:
                import fitz
                doc = fitz.open(stream=data, filetype="pdf")
                return len(doc)
            except Exception:
                return 0

    # ── File cache ────────────────────────────────────────────────────────────

    def _cache_key(self, url: str) -> str:
        return hashlib.sha256(url.encode()).hexdigest()[:24]

    def _cache_lookup(self, url: str) -> dict | None:
        """Return cached result dict if a fresh file exists, else None."""
        import json
        meta_path = self._storage / f"{self._cache_key(url)}.meta.json"
        if not meta_path.exists():
            return None

        try:
            meta = json.loads(meta_path.read_text())
            fetched_at = datetime.fromisoformat(meta.get("fetched_at", ""))
            age_days   = (datetime.now(timezone.utc) - fetched_at).days
            if age_days > self._cache_days:
                meta_path.unlink(missing_ok=True)
                return None

            # Verify the cached file still exists
            file_path = meta.get("file_path", "")
            if file_path and not Path(file_path).exists():
                return None

            return meta
        except Exception:
            return None

    def _cache_store(self, url: str, result: dict) -> None:
        import json
        meta_path = self._storage / f"{self._cache_key(url)}.meta.json"
        try:
            meta_path.write_text(json.dumps(result, default=str))
        except Exception as exc:
            logger.debug("[retrieval] Cache write failed: %s", exc)

    def _ext(self, content_type: str, url: str) -> str:
        if "pdf" in content_type.lower():
            return "pdf"
        if "html" in content_type.lower():
            return "html"
        if url.lower().endswith(".pdf"):
            return "pdf"
        return "bin"
