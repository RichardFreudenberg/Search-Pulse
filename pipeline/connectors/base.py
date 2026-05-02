"""
pipeline/connectors/base.py
───────────────────────────
Abstract base class for all data-source connectors.

Every connector must:
  • Inherit BaseConnector
  • Implement fetch() → list[RawRecord]
  • Respect rate limits and robots.txt
  • Output standardised RawRecord objects
  • Never bypass CAPTCHAs or violate site ToS

The ingestion queue is injected at runtime so connectors stay
testable in isolation (pass queue=None for unit tests).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)


# ─── Canonical record shape ────────────────────────────────────────────────────

@dataclass
class RawRecord:
    """
    Standardised envelope emitted by every connector.
    The ingestion pipeline consumes this shape — do not change field names
    without migrating all downstream consumers.
    """
    source: str                        # e.g. "bundesanzeiger"
    record_type: str                   # "filing" | "company" | "event"
    raw_data: dict[str, Any]           # everything the source returned
    source_url: str = ""               # canonical URL of this record
    source_id: str = ""                # unique ID within the source system
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "source":      self.source,
            "type":        self.record_type,
            "raw_data":    self.raw_data,
            "source_url":  self.source_url,
            "source_id":   self.source_id,
            "timestamp":   self.timestamp,
        }

    @property
    def dedup_key(self) -> str:
        """Deterministic fingerprint used to skip re-ingested duplicates."""
        payload = f"{self.source}:{self.source_id or self.source_url}"
        return hashlib.sha256(payload.encode()).hexdigest()


# ─── Rate limiter ─────────────────────────────────────────────────────────────

class _RateLimiter:
    """Simple token-bucket rate limiter (thread/coroutine safe)."""

    def __init__(self, rps: float) -> None:
        self._interval = 1.0 / max(rps, 0.01)
        self._last_call = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._interval - (now - self._last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()


# ─── Base connector ───────────────────────────────────────────────────────────

class BaseConnector(ABC):
    """
    All data-source connectors inherit this class.

    Sub-classes override:
      • SOURCE_NAME      – short identifier string
      • fetch()          – the main entry point; yields/returns RawRecord list
      • _parse_response  – (optional) HTML/JSON → dict extraction
    """

    SOURCE_NAME: str = "base"

    def __init__(self, cfg: dict, queue: Any = None) -> None:
        """
        Args:
            cfg:   The connector's sub-section from pipeline.yaml
                   e.g. config.get('data_sources', 'bundesanzeiger')
            queue: An ingestion queue instance (optional; None for tests)
        """
        self._cfg = cfg
        self._queue = queue
        self._rate_limiter = _RateLimiter(cfg.get("rate_limit_rps", 1.0))
        self._timeout = httpx.Timeout(cfg.get("timeout_seconds", 30))
        self._user_agent = cfg.get(
            "user_agent",
            "SearchPulsePipeline/1.0 (research tool; https://searchpulse.io)"
        )
        self._robots: RobotFileParser | None = None
        self._base_url: str = cfg.get("base_url", "")

        # Shared async client — lazily created in _client property
        self.__client: httpx.AsyncClient | None = None

    # ── HTTP client ───────────────────────────────────────────────────────────

    @property
    def _client(self) -> httpx.AsyncClient:
        if self.__client is None or self.__client.is_closed:
            self.__client = httpx.AsyncClient(
                headers={"User-Agent": self._user_agent},
                timeout=self._timeout,
                follow_redirects=True,
            )
        return self.__client

    async def close(self) -> None:
        """Release the HTTP client. Call when the connector is done."""
        if self.__client and not self.__client.is_closed:
            await self.__client.aclose()

    # ── robots.txt ────────────────────────────────────────────────────────────

    async def _check_robots(self, url: str) -> bool:
        """Return True if the URL is allowed by robots.txt."""
        if not self._base_url:
            return True
        if self._robots is None:
            robots_url = urljoin(self._base_url, "/robots.txt")
            try:
                resp = await self._client.get(robots_url)
                self._robots = RobotFileParser()
                self._robots.set_url(robots_url)
                self._robots.read()
                # Feed the content manually
                self._robots.parse(resp.text.splitlines())
            except Exception:
                logger.debug("Could not fetch robots.txt for %s", self._base_url)
                return True
        return self._robots.can_fetch(self._user_agent, url)

    # ── Resilient GET ─────────────────────────────────────────────────────────

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        """
        Rate-limited, robots-respecting, retrying GET.

        Raises:
            PermissionError   if robots.txt disallows the URL
            httpx.HTTPError   on persistent network failure
        """
        if not await self._check_robots(url):
            raise PermissionError(f"robots.txt disallows: {url}")

        await self._rate_limiter.acquire()

        attempts = self._cfg.get("retry_attempts", 3)
        backoff  = self._cfg.get("retry_backoff_seconds", 5)

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(attempts),
            wait=wait_exponential(multiplier=backoff, min=backoff, max=backoff * 8),
            retry=retry_if_exception_type(
                (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError)
            ),
            reraise=True,
        ):
            with attempt:
                resp = await self._client.get(url, **kwargs)
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", backoff * 2))
                    logger.warning("Rate limited by %s — sleeping %ds", url, retry_after)
                    await asyncio.sleep(retry_after)
                    resp.raise_for_status()
                resp.raise_for_status()
                return resp

    # ── Abstract interface ────────────────────────────────────────────────────

    @abstractmethod
    async def fetch(
        self,
        query: str | None = None,
        since: datetime | None = None,
        **kwargs,
    ) -> list[RawRecord]:
        """
        Fetch records from the source.

        Args:
            query:  Optional keyword / company name filter
            since:  Only fetch records newer than this datetime (incremental)
            kwargs: Source-specific parameters

        Returns:
            list of RawRecord — each will be pushed to the ingestion queue
        """

    # ── Queue push ────────────────────────────────────────────────────────────

    async def push_to_queue(self, records: list[RawRecord]) -> int:
        """
        Push records to the ingestion queue.
        Returns count of records actually enqueued (skips duplicates).
        """
        if self._queue is None:
            logger.debug("No queue configured — %d records not enqueued", len(records))
            return 0

        count = 0
        for rec in records:
            enqueued = await self._queue.push(rec)
            if enqueued:
                count += 1
        logger.info("[%s] Pushed %d/%d records to queue", self.SOURCE_NAME, count, len(records))
        return count

    # ── Convenience factory ───────────────────────────────────────────────────

    def _make_record(
        self,
        record_type: str,
        raw_data: dict,
        source_url: str = "",
        source_id: str = "",
    ) -> RawRecord:
        return RawRecord(
            source=self.SOURCE_NAME,
            record_type=record_type,
            raw_data=raw_data,
            source_url=source_url,
            source_id=source_id,
        )
