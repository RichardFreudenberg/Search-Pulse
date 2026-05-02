"""
pipeline/db/database.py
────────────────────────
SQLAlchemy engine + session factory.

Usage:
    from pipeline.db.database import get_session, engine

    with get_session() as session:
        company = session.get(CanonicalCompany, company_id)

The engine is created once (singleton) and reused across requests.
For async contexts use async_session (also provided).
"""

from __future__ import annotations

from contextlib import contextmanager, asynccontextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from pipeline.config import config as cfg_module
from pipeline.db.models import Base

# ─── Sync engine ──────────────────────────────────────────────────────────────

def _build_sync_url(url: str) -> str:
    """Convert asyncpg URL to psycopg2 if needed."""
    return url.replace("postgresql+asyncpg://", "postgresql://")


_db_cfg      = cfg_module.get("database")
_SYNC_URL    = _build_sync_url(_db_cfg.get("url", "postgresql://pipeline:pipeline@localhost:5432/pipeline"))
_POOL_SIZE   = _db_cfg.get("pool_size", 10)
_MAX_OVER    = _db_cfg.get("max_overflow", 5)
_ECHO        = _db_cfg.get("echo_sql", False)

engine = create_engine(
    _SYNC_URL,
    pool_size         = _POOL_SIZE,
    max_overflow      = _MAX_OVER,
    pool_pre_ping     = True,
    echo              = _ECHO,
)

_SessionFactory = sessionmaker(bind=engine, autoflush=True, autocommit=False)


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """Context manager that yields a Session and auto-commits/rolls back."""
    session = _SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ─── Async engine (for FastAPI) ───────────────────────────────────────────────

def _build_async_url(url: str) -> str:
    """Ensure the URL uses asyncpg driver."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


_ASYNC_URL = _build_async_url(_db_cfg.get("url", "postgresql://pipeline:pipeline@localhost:5432/pipeline"))

async_engine = create_async_engine(
    _ASYNC_URL,
    pool_size    = _POOL_SIZE,
    max_overflow = _MAX_OVER,
    pool_pre_ping= True,
    echo         = _ECHO,
)

_AsyncSessionFactory = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    autoflush=True,
    autocommit=False,
    expire_on_commit=False,
)


@asynccontextmanager
async def get_async_session() -> AsyncSession:
    """Async context manager yielding an AsyncSession."""
    async with _AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─── Schema management ────────────────────────────────────────────────────────

def create_tables() -> None:
    """Create all pipeline tables (idempotent — skips existing tables)."""
    Base.metadata.create_all(engine)


def drop_tables() -> None:
    """Drop all pipeline tables — DESTRUCTIVE, use only in tests."""
    Base.metadata.drop_all(engine)
