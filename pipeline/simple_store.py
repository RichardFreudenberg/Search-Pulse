"""
pipeline/simple_store.py
─────────────────────────
Lightweight SQLite-backed store that replaces the full
PostgreSQL + Redis stack when running without Docker.

Provides:
  - Deduplication (was Redis SET)
  - Company storage (was PostgreSQL canonical_companies)
  - Already-seen tracking so incremental runs skip old records

SQLite file is created automatically at ./data/pipeline.db
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

_DB_PATH = Path(__file__).parent / "data" / "pipeline.db"


def _conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS companies (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                registry_number TEXT,
                legal_form      TEXT,
                court           TEXT,
                court_state     TEXT,
                city            TEXT,
                postal_code     TEXT,
                status          TEXT DEFAULT 'active',
                industry        TEXT,
                source          TEXT,
                raw_json        TEXT,
                created_at      TEXT,
                updated_at      TEXT,
                firestore_synced INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_companies_name   ON companies(name);
            CREATE INDEX IF NOT EXISTS idx_companies_rn     ON companies(registry_number);
            CREATE INDEX IF NOT EXISTS idx_companies_synced ON companies(firestore_synced);

            CREATE TABLE IF NOT EXISTS seen_keys (
                key        TEXT PRIMARY KEY,
                seen_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS run_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                source     TEXT,
                query      TEXT,
                fetched    INTEGER DEFAULT 0,
                new_items  INTEGER DEFAULT 0,
                ran_at     TEXT
            );

            CREATE TABLE IF NOT EXISTS financials (
                company_id         TEXT PRIMARY KEY,
                fiscal_year        INTEGER,
                revenue            REAL,
                gross_profit       REAL,
                ebitda             REAL,
                ebit               REAL,
                depreciation       REAL,
                interest           REAL,
                ebt                REAL,
                taxes              REAL,
                net_income         REAL,
                employees          INTEGER,
                ebitda_margin_pct  REAL,
                net_margin_pct     REAL,
                personnel_costs    REAL,
                source_url         TEXT,
                data_quality       TEXT,
                fetched_at         TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_financials_year ON financials(fiscal_year);
        """)


def already_seen(dedup_key: str) -> bool:
    with _conn() as conn:
        row = conn.execute("SELECT 1 FROM seen_keys WHERE key=?", (dedup_key,)).fetchone()
        return row is not None


def mark_seen(dedup_key: str) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen_keys(key, seen_at) VALUES (?,?)",
            (dedup_key, datetime.now(timezone.utc).isoformat())
        )


def upsert_company(company: dict) -> bool:
    """
    Store or update a company record.
    Returns True if this is a new company, False if updated.
    """
    now = datetime.now(timezone.utc).isoformat()
    cid = company.get("id") or _make_id(company)

    with _conn() as conn:
        existing = conn.execute(
            "SELECT id FROM companies WHERE id=?", (cid,)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE companies SET
                    name=?, registry_number=?, legal_form=?, court=?,
                    court_state=?, city=?, postal_code=?, status=?,
                    industry=?, source=?, raw_json=?, updated_at=?
                WHERE id=?
            """, (
                company.get("name", ""),
                company.get("registry_number", ""),
                company.get("legal_form", ""),
                company.get("court", ""),
                company.get("court_state", ""),
                company.get("city", ""),
                company.get("postal_code", ""),
                company.get("status", "unknown"),
                company.get("industry", ""),
                company.get("source", ""),
                json.dumps(company.get("raw", {})),
                now,
                cid,
            ))
            return False
        else:
            conn.execute("""
                INSERT INTO companies
                (id, name, registry_number, legal_form, court, court_state,
                 city, postal_code, status, industry, source, raw_json,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                cid,
                company.get("name", ""),
                company.get("registry_number", ""),
                company.get("legal_form", ""),
                company.get("court", ""),
                company.get("court_state", ""),
                company.get("city", ""),
                company.get("postal_code", ""),
                company.get("status", "unknown"),
                company.get("industry", ""),
                company.get("source", ""),
                json.dumps(company.get("raw", {})),
                now,
                now,
            ))
            return True


def get_unsynced(limit: int = 500) -> list[dict]:
    """Return companies not yet written to Firestore."""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM companies WHERE firestore_synced=0 LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def mark_synced(company_id: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE companies SET firestore_synced=1 WHERE id=?",
            (company_id,)
        )


def count_companies() -> int:
    with _conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]


def log_run(source: str, query: str, fetched: int, new_items: int) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT INTO run_log(source, query, fetched, new_items, ran_at) VALUES(?,?,?,?,?)",
            (source, query, fetched, new_items, datetime.now(timezone.utc).isoformat())
        )


def get_recent_companies(n: int = 20) -> list[dict]:
    """Return the N most recently added companies."""
    with _conn() as conn:
        rows = conn.execute(
            """SELECT name, legal_form, city, registry_number, source, created_at
               FROM companies ORDER BY created_at DESC LIMIT ?""",
            (n,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_run_stats() -> dict:
    """Return aggregate statistics for the status display."""
    with _conn() as conn:
        total    = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        unsynced = conn.execute(
            "SELECT COUNT(*) FROM companies WHERE firestore_synced=0"
        ).fetchone()[0]
        run_count = conn.execute("SELECT COUNT(*) FROM run_log").fetchone()[0]
        last = conn.execute(
            "SELECT source, query, fetched, new_items, ran_at "
            "FROM run_log ORDER BY ran_at DESC LIMIT 1"
        ).fetchone()
        last_run = dict(last) if last else None
    return {
        "total":     total,
        "unsynced":  unsynced,
        "run_count": run_count,
        "last_run":  last_run,
    }


def get_all_companies(limit: int = 10_000) -> list[dict]:
    """Return all company rows (id, name, registry_number, …)."""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM companies LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


# ─── Financials ───────────────────────────────────────────────────────────────

_FINANCIAL_COLS = (
    "fiscal_year", "revenue", "gross_profit", "ebitda", "ebit",
    "depreciation", "interest", "ebt", "taxes", "net_income",
    "employees", "ebitda_margin_pct", "net_margin_pct",
    "personnel_costs", "source_url", "data_quality",
)


def upsert_financials(company_id: str, data: dict) -> None:
    """Store or replace financial data for a company."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        conn.execute(f"""
            INSERT OR REPLACE INTO financials
            (company_id, {', '.join(_FINANCIAL_COLS)}, fetched_at)
            VALUES (?, {', '.join('?' * len(_FINANCIAL_COLS))}, ?)
        """, (
            company_id,
            *[data.get(c) for c in _FINANCIAL_COLS],
            now,
        ))


def get_financials(company_id: str) -> dict | None:
    """Retrieve stored financial data for one company, or None."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM financials WHERE company_id=?", (company_id,)
        ).fetchone()
        return dict(row) if row else None


def get_all_financials() -> list[dict]:
    """Return all rows from the financials table."""
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM financials").fetchall()
        return [dict(r) for r in rows]


def _make_id(company: dict) -> str:
    import hashlib
    key = f"{company.get('registry_number', '')}{company.get('name', '')}{company.get('court', '')}"
    return hashlib.md5(key.encode()).hexdigest()
