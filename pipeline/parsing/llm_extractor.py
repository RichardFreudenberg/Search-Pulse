"""
pipeline/parsing/llm_extractor.py
───────────────────────────────────
LLM-based extraction fallback for messy / scanned documents.

Used when:
  • pdfplumber and PyMuPDF return <100 chars of text (likely scanned PDF)
  • Regex patterns fail to extract key financial figures
  • The document layout is non-standard

Supports:
  • OpenAI GPT-4o (default when OPENAI_API_KEY is set)
  • Anthropic Claude (when ANTHROPIC_API_KEY is set)

The extractor sends a chunked text prompt (not the raw file) so
no binary data leaves the system — only the extracted text.

Cost note: LLM extraction is expensive (~$0.02–$0.05 per document).
It is only triggered as a final fallback, never for first-pass extraction.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a German corporate data extraction assistant.
Extract structured information from German company filing text.
Always respond with valid JSON. Use null for fields not found.
All amounts should be in EUR as plain numbers (no currency symbols)."""

_USER_TEMPLATE = """Extract the following fields from this German company document.
Return ONLY a JSON object with these exact keys:

{{
  "company_name": "string or null",
  "registry_number": "string like 'HRB 12345' or null",
  "legal_form": "string like 'GmbH' or null",
  "fiscal_year": "integer year or null",
  "revenue_eur": "float or null",
  "net_profit_eur": "float or null",
  "employees": "integer or null",
  "directors": ["list of {{name, role}} objects"],
  "business_purpose": "string or null",
  "city": "string or null",
  "postal_code": "string or null"
}}

Document text (first 3000 characters):
---
{text}
---"""


class LLMExtractor:
    """
    LLM-based structured extraction from unstructured German document text.
    Tries OpenAI first, then Anthropic, then returns empty result.
    """

    def __init__(self, max_chars: int = 3000) -> None:
        self._max_chars = max_chars

    def extract(self, text: str) -> dict:
        """
        Extract structured fields from text using LLM.

        Args:
            text: Raw document text (will be truncated to max_chars)

        Returns:
            Dict with extracted fields (null/None for missing values)
        """
        if not text or len(text.strip()) < 50:
            return {}

        chunk = text[:self._max_chars]

        # Try providers in order of preference
        for provider in (self._try_openai, self._try_anthropic):
            try:
                result = provider(chunk)
                if result:
                    logger.info("[llm] Extraction succeeded via %s", provider.__name__)
                    return result
            except Exception as exc:
                logger.debug("[llm] %s failed: %s", provider.__name__, exc)

        logger.warning("[llm] All LLM providers failed — returning empty extraction")
        return {}

    # ── OpenAI ────────────────────────────────────────────────────────────────

    def _try_openai(self, text: str) -> dict | None:
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            return None

        try:
            import openai
        except ImportError:
            logger.debug("[llm] openai package not installed")
            return None

        client  = openai.OpenAI(api_key=api_key)
        prompt  = _USER_TEMPLATE.format(text=text)

        resp = client.chat.completions.create(
            model="gpt-4o-mini",               # cheaper, still accurate for extraction
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0,
            max_tokens=512,
            response_format={"type": "json_object"},
        )

        raw = resp.choices[0].message.content
        return self._safe_json(raw)

    # ── Anthropic ─────────────────────────────────────────────────────────────

    def _try_anthropic(self, text: str) -> dict | None:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return None

        try:
            import anthropic
        except ImportError:
            logger.debug("[llm] anthropic package not installed")
            return None

        client  = anthropic.Anthropic(api_key=api_key)
        prompt  = _USER_TEMPLATE.format(text=text)

        msg = client.messages.create(
            model="claude-haiku-20240307",
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = msg.content[0].text
        return self._safe_json(raw)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _safe_json(self, raw: str) -> dict:
        """Parse JSON from LLM output, handling common formatting issues."""
        if not raw:
            return {}
        # Strip markdown code fences if present
        raw = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
        try:
            parsed = json.loads(raw)
            return {k: v for k, v in parsed.items() if v is not None}
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("[llm] JSON parse error: %s | raw: %r", exc, raw[:200])
            return {}
