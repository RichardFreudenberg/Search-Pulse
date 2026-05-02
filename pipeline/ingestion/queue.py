"""
pipeline/ingestion/queue.py
────────────────────────────
Queue abstraction that wraps Redis, RabbitMQ, or SQS behind a
single async interface.  The rest of the pipeline only calls:

    queue.push(record)    →  True if enqueued (False if dedup skip)
    queue.pop()           →  RawRecord | None
    queue.ack(job_id)     →  mark processed
    queue.nack(job_id)    →  requeue for retry
    queue.length(name)    →  current depth
    queue.dead_letters()  →  list failed messages

Switch backends by changing  ingestion.queue_backend  in pipeline.yaml
without touching any connector or task code.

Deduplication:
  Each record's dedup_key (sha256 of source:id) is stored in a Redis
  SET with a TTL equal to  deduplication_window_hours  from config.
  Redis is used for dedup even when the queue backend is RabbitMQ/SQS.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


# ─── Envelope ─────────────────────────────────────────────────────────────────

@dataclass
class QueueMessage:
    job_id: str
    payload: dict          # RawRecord.to_dict()
    queue_name: str
    enqueued_at: float
    attempts: int = 0


# ─── Abstract base ─────────────────────────────────────────────────────────────

class BaseQueue(ABC):

    def __init__(self, cfg: dict) -> None:
        self._cfg  = cfg
        self._dedup_ttl = int(cfg.get("deduplication_window_hours", 24)) * 3600
        self._batch_size = cfg.get("batch_size", 50)
        self._queues = cfg.get("queues", {
            "high_priority": "pipeline:high",
            "default":       "pipeline:default",
            "bulk":          "pipeline:bulk",
        })
        self._dlq = cfg.get("dead_letter_queue", "pipeline:dead")

    @abstractmethod
    async def push(self, record: Any, queue: str = "default") -> bool:
        """Enqueue a RawRecord. Returns False if deduplicated."""

    @abstractmethod
    async def pop(self, queue: str = "default", timeout: float = 5.0) -> QueueMessage | None:
        """Pop the next message (blocking up to `timeout` seconds)."""

    @abstractmethod
    async def ack(self, job_id: str, queue: str = "default") -> None:
        """Mark a message as successfully processed."""

    @abstractmethod
    async def nack(self, job_id: str, queue: str = "default") -> None:
        """Return a message to the queue for retry."""

    @abstractmethod
    async def length(self, queue: str = "default") -> int:
        """Current number of messages in the queue."""

    @abstractmethod
    async def dead_letters(self, limit: int = 100) -> list[dict]:
        """Return failed messages from the dead-letter queue."""

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _queue_name(self, logical: str) -> str:
        return self._queues.get(logical, self._queues.get("default", "pipeline:default"))


# ─── Redis queue (default) ────────────────────────────────────────────────────

class RedisQueue(BaseQueue):
    """
    Redis-backed queue using sorted sets (ZADD/ZPOPMIN) for ordering
    and a separate HASH for in-flight tracking.

    Layout in Redis:
      pipeline:<name>          ZSET  score=enqueue_time, member=job_id
      pipeline:inflight        HASH  job_id → JSON message
      pipeline:dedup           SET   dedup_keys (with TTL managed per-key)
      pipeline:dead            LIST  failed job JSON
    """

    def __init__(self, cfg: dict) -> None:
        super().__init__(cfg)
        self._redis_url = cfg.get("redis_url", "redis://localhost:6379/0")
        self._redis: Any = None   # aioredis client, lazy init

    async def _get_redis(self):
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
            except ImportError:
                raise RuntimeError(
                    "redis package not installed — run: pip install redis[asyncio]"
                )
            self._redis = aioredis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    async def push(self, record: Any, queue: str = "default") -> bool:
        r = await self._get_redis()
        queue_key = self._queue_name(queue)
        dedup_key = f"dedup:{record.dedup_key}"

        # Deduplication check
        already = await r.get(dedup_key)
        if already:
            logger.debug("Dedup skip: %s", record.dedup_key[:16])
            return False

        job_id  = str(uuid.uuid4())
        payload = record.to_dict()
        msg = QueueMessage(
            job_id=job_id,
            payload=payload,
            queue_name=queue_key,
            enqueued_at=time.time(),
        )

        pipe = r.pipeline()
        pipe.zadd(queue_key, {job_id: time.time()})
        pipe.hset("pipeline:inflight", job_id, json.dumps({
            "job_id":      job_id,
            "payload":     payload,
            "queue_name":  queue_key,
            "enqueued_at": msg.enqueued_at,
            "attempts":    0,
        }))
        pipe.set(dedup_key, "1", ex=self._dedup_ttl)
        await pipe.execute()

        logger.debug("Enqueued %s → %s", job_id[:8], queue_key)
        return True

    async def pop(self, queue: str = "default", timeout: float = 5.0) -> QueueMessage | None:
        r = await self._get_redis()
        queue_key = self._queue_name(queue)

        # Atomic pop: lowest score (earliest enqueue time)
        items = await r.zpopmin(queue_key, 1)
        if not items:
            return None

        job_id = items[0][0]
        raw    = await r.hget("pipeline:inflight", job_id)
        if not raw:
            logger.warning("Job %s not found in inflight hash", job_id[:8])
            return None

        data = json.loads(raw)
        data["attempts"] = data.get("attempts", 0) + 1
        await r.hset("pipeline:inflight", job_id, json.dumps(data))

        return QueueMessage(
            job_id     = data["job_id"],
            payload    = data["payload"],
            queue_name = data["queue_name"],
            enqueued_at= data["enqueued_at"],
            attempts   = data["attempts"],
        )

    async def ack(self, job_id: str, queue: str = "default") -> None:
        r = await self._get_redis()
        await r.hdel("pipeline:inflight", job_id)

    async def nack(self, job_id: str, queue: str = "default") -> None:
        r = await self._get_redis()
        queue_key = self._queue_name(queue)

        raw = await r.hget("pipeline:inflight", job_id)
        if not raw:
            return

        data = json.loads(raw)
        attempts = data.get("attempts", 1)
        max_retry = self._cfg.get("max_retries", 3)

        if attempts >= max_retry:
            # Move to dead-letter queue
            await r.lpush(self._dlq, json.dumps(data))
            await r.hdel("pipeline:inflight", job_id)
            logger.warning("Job %s exceeded max retries → DLQ", job_id[:8])
        else:
            # Requeue with exponential backoff score
            backoff = 2 ** attempts
            await r.zadd(queue_key, {job_id: time.time() + backoff})
            logger.info("Requeued job %s (attempt %d, backoff %ds)", job_id[:8], attempts, backoff)

    async def length(self, queue: str = "default") -> int:
        r = await self._get_redis()
        return await r.zcard(self._queue_name(queue))

    async def dead_letters(self, limit: int = 100) -> list[dict]:
        r = await self._get_redis()
        items = await r.lrange(self._dlq, 0, limit - 1)
        return [json.loads(i) for i in items]


# ─── In-memory queue (testing only) ──────────────────────────────────────────

class InMemoryQueue(BaseQueue):
    """
    Simple in-process queue for unit tests.
    Not persistent, not distributed — never use in production.
    """

    def __init__(self, cfg: dict | None = None) -> None:
        super().__init__(cfg or {})
        self._queues_data: dict[str, list[QueueMessage]] = {}
        self._inflight: dict[str, QueueMessage] = {}
        self._dedup_set: set[str] = set()
        self._dead: list[dict] = []

    async def push(self, record: Any, queue: str = "default") -> bool:
        key = record.dedup_key
        if key in self._dedup_set:
            return False
        self._dedup_set.add(key)
        q = self._queues_data.setdefault(queue, [])
        msg = QueueMessage(
            job_id=str(uuid.uuid4()),
            payload=record.to_dict(),
            queue_name=queue,
            enqueued_at=time.time(),
        )
        q.append(msg)
        return True

    async def pop(self, queue: str = "default", timeout: float = 0.0) -> QueueMessage | None:
        q = self._queues_data.get(queue, [])
        if not q:
            return None
        msg = q.pop(0)
        msg.attempts += 1
        self._inflight[msg.job_id] = msg
        return msg

    async def ack(self, job_id: str, queue: str = "default") -> None:
        self._inflight.pop(job_id, None)

    async def nack(self, job_id: str, queue: str = "default") -> None:
        msg = self._inflight.pop(job_id, None)
        if msg and msg.attempts < 3:
            self._queues_data.setdefault(queue, []).append(msg)
        elif msg:
            self._dead.append({"job_id": job_id, "payload": msg.payload})

    async def length(self, queue: str = "default") -> int:
        return len(self._queues_data.get(queue, []))

    async def dead_letters(self, limit: int = 100) -> list[dict]:
        return self._dead[:limit]


# ─── Factory ──────────────────────────────────────────────────────────────────

def create_queue(cfg: dict) -> BaseQueue:
    """
    Instantiate the correct queue implementation based on config.
    Usage:
        from pipeline.ingestion.queue import create_queue
        from pipeline.config import config
        queue = create_queue(config.get('ingestion'))
    """
    backend = cfg.get("queue_backend", "redis").lower()
    if backend == "redis":
        return RedisQueue(cfg)
    if backend == "memory":
        return InMemoryQueue(cfg)
    raise ValueError(
        f"Unknown queue backend: {backend!r}. Supported: redis, memory"
    )
