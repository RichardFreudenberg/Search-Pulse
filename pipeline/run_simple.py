#!/usr/bin/env python3
"""
pipeline/run_simple.py
──────────────────────
Docker-free pipeline runner — no PostgreSQL, no Redis, no Celery needed.

All data is stored locally in pipeline/data/pipeline.db (SQLite).
Optionally syncs to your existing Firebase CRM.

Usage:
  python pipeline/run_simple.py --query "GmbH München"
  python pipeline/run_simple.py --query "Bäckerei Bayern" --source ur --pages 3
  python pipeline/run_simple.py --query "Maschinenbau" --sync
  python pipeline/run_simple.py --status
  python pipeline/run_simple.py --list 20
  python pipeline/run_simple.py --sync-firestore

Requirements (pip install only — no Docker):
  pip install -r pipeline/requirements_simple.txt

To sync to Firestore add these to a .env file or set them in PowerShell:
  FIREBASE_CREDENTIALS_PATH=./config/serviceAccountKey.json
  FIREBASE_PROJECT_ID=your-firebase-project-id
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ── Windows: force UTF-8 output so box-drawing chars print correctly ──────────
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass  # Python < 3.7 — ignore

# ── Path setup: allow "python pipeline/run_simple.py" from project root ───────
# This adds search-fund-crm/ to sys.path so "from pipeline.xxx import ..." works
_ROOT = Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ── Imports from the pipeline package ─────────────────────────────────────────
from pipeline.simple_store import (
    init_db,
    already_seen,
    mark_seen,
    upsert_company,
    get_unsynced,
    mark_synced,
    count_companies,
    log_run,
    get_recent_companies,
    get_run_stats,
    get_all_companies,
    upsert_financials,
    get_financials,
    get_all_financials,
)
from pipeline.connectors.bundesanzeiger import BundesanzeigerConnector
from pipeline.connectors.unternehmensregister import UnternehmensregisterConnector
from pipeline.connectors.industry_classifier import classify_industry

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s  %(levelname)-7s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("run_simple")


# ─── Minimal connector configs ────────────────────────────────────────────────
# These mirror the defaults in config/pipeline.yaml but need no YAML file.

_BA_CFG: dict = {
    "base_url":              "https://www.bundesanzeiger.de",
    "search_path":           "/pub/de/suche",
    "rate_limit_rps":        1.0,
    "timeout_seconds":       30,
    "retry_attempts":        3,
    "retry_backoff_seconds": 5,
}

_UR_CFG: dict = {
    "base_url":              "https://www.unternehmensregister.de",
    "search_path":           "/ureg/result.html",
    "rate_limit_rps":        0.5,
    "timeout_seconds":       30,
    "retry_attempts":        3,
    "retry_backoff_seconds": 5,
}

_SOURCE_LABELS = {
    "oc": "Bundesanzeiger",
    "ba": "Bundesanzeiger",
    "ur": "Unternehmensregister",
}


# ─── RawRecord → simple_store dict ────────────────────────────────────────────

def _record_to_company(record) -> dict:
    """
    Flatten a connector's RawRecord into the dict shape that simple_store
    expects for upsert_company().
    """
    rd   = record.raw_data
    addr = rd.get("address", {})
    if not isinstance(addr, dict):
        addr = {}

    return {
        "name":            (rd.get("company_name", "") or "").strip(),
        "registry_number": (rd.get("registry_number", "") or rd.get("registry_no", "") or "").strip(),
        "legal_form":      (rd.get("legal_form", "") or "").strip(),
        "court":           (rd.get("court", "") or "").strip(),
        "court_state":     "",
        "city":            (addr.get("city", "") or rd.get("city", "") or "").strip(),
        "postal_code":     (addr.get("postal_code", "") or rd.get("postal_code", "") or "").strip(),
        "status":          (rd.get("status", "unknown") or "unknown").strip(),
        "industry":        classify_industry(
                               (rd.get("company_name", "") or "").strip(),
                               (rd.get("business_purpose", "") or rd.get("purpose", "") or "").strip(),
                           ),
        "source":          record.source,
        "raw":             rd,
    }


# ─── Firestore sync ───────────────────────────────────────────────────────────

def _sync_to_firestore(companies: list[dict]) -> int:
    """
    Write a list of company dicts (from simple_store.get_unsynced()) to
    Firestore.  Uses the same collection layout as the existing CRM so
    companies appear immediately in the frontend.

    Returns the number of documents successfully written.
    """
    creds_path = os.environ.get(
        "FIREBASE_CREDENTIALS_PATH",
        "./config/serviceAccountKey.json",
    )
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "")
    user_id    = os.environ.get("FIREBASE_USER_ID", "")

    if not project_id:
        logger.warning("FIREBASE_PROJECT_ID not set — skipping Firestore sync.")
        return 0
    if not user_id:
        logger.warning("FIREBASE_USER_ID not set — skipping Firestore sync.\n"
                       "  Set it with: $env:FIREBASE_USER_ID = 'your-uid'")
        return 0

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
    except ImportError:
        logger.error("firebase-admin not installed. Run: pip install firebase-admin")
        return 0

    # Initialise Firebase app (idempotent)
    if not firebase_admin._apps:
        key_path = Path(creds_path)
        if not key_path.exists():
            logger.error("Service account key not found at %s", key_path)
            return 0
        cred = credentials.Certificate(str(key_path))
        firebase_admin.initialize_app(cred, {"projectId": project_id})
        logger.info("[firestore] Connected to project %r as user %s", project_id, user_id)

    db    = fs.client()
    # ── Write to the exact same path the CRM uses ─────────────────────────────
    # Path: /users/{uid}/companies/{docId}  (matches db.js _col() function)
    user_companies = db.collection("users").document(user_id).collection("companies")
    count = 0

    for company in companies:
        cid = company.get("id")
        if not cid:
            continue
        name = company.get("name", "").strip()
        if not name:
            continue
        try:
            # Field names must match exactly what companies.js renders
            doc = {
                "name":        name,
                "type":        "Prospect",          # shows in company type badge
                "industry":    company.get("industry", ""),
                "description": _build_company_description(company),
                "location":    _fmt_location(company),
                "website":     "",
                "size":        "",                  # employees — added by financials later
                "hrNumber":    company.get("registry_number", ""),
                "status":      company.get("status", "active"),
                "source":      "pipeline",
                "createdAt":   datetime.now(timezone.utc).isoformat(),
                "updatedAt":   datetime.now(timezone.utc).isoformat(),
                # Pipeline metadata — never breaks existing CRM fields
                "_pipeline": {
                    "court":          company.get("court", ""),
                    "data_source":    company.get("source", ""),
                    "last_synced_at": datetime.now(timezone.utc).isoformat(),
                },
            }
            user_companies.document(cid).set(doc, merge=True)
            mark_synced(cid)
            count += 1
            logger.info("[firestore] + %s", name)
        except Exception as exc:
            logger.error("[firestore] Failed to sync %s (%s): %s", cid, name, exc)

    return count


def _sync_financials_to_firestore(financials_map: dict[str, dict]) -> int:
    """
    Merge financials into existing Firestore company documents under
    _pipeline.financials.  Only updates companies that already exist.
    Returns the number of documents updated.
    """
    creds_path = os.environ.get(
        "FIREBASE_CREDENTIALS_PATH",
        "./config/serviceAccountKey.json",
    )
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "")
    user_id    = os.environ.get("FIREBASE_USER_ID", "")

    if not project_id or not user_id:
        logger.warning("FIREBASE_PROJECT_ID / FIREBASE_USER_ID not set — skipping financials sync.")
        return 0

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
    except ImportError:
        logger.error("firebase-admin not installed.")
        return 0

    if not firebase_admin._apps:
        key_path = Path(creds_path)
        if not key_path.exists():
            logger.error("Service account key not found at %s", key_path)
            return 0
        cred = credentials.Certificate(str(key_path))
        firebase_admin.initialize_app(cred, {"projectId": project_id})

    db             = fs.client()
    user_companies = db.collection("users").document(user_id).collection("companies")
    count          = 0

    for company_id, fin in financials_map.items():
        try:
            # Strip internal-only keys before writing
            clean = {k: v for k, v in fin.items()
                     if k not in ("company_id", "fetched_at") and v is not None}
            user_companies.document(company_id).set(
                {"_pipeline": {"financials": clean,
                               "financials_fetched_at": fin.get("fetched_at", "")}},
                merge=True,
            )
            count += 1
            logger.info("[firestore-fin] Updated financials for %s", company_id)
        except Exception as exc:
            logger.error("[firestore-fin] Failed for %s: %s", company_id, exc)

    return count


def _build_company_description(c: dict) -> str:
    parts = []
    if c.get("legal_form"):
        parts.append(c["legal_form"])
    if c.get("registry_number"):
        parts.append(c["registry_number"])
    if c.get("court"):
        parts.append(f"AG {c['court']}")
    return " · ".join(parts)


def _fmt_location(c: dict) -> str:
    parts = [p for p in [c.get("postal_code", ""), c.get("city", "")] if p]
    return " ".join(parts)


# ─── Playwright / Bundesanzeiger fetch ────────────────────────────────────────

async def _oc_fetch(query: str, max_pages: int) -> list:
    """
    Headless-browser scraper for Bundesanzeiger.de.
    Uses Playwright (Chromium) to render the JavaScript search results.
    Returns a list of RawRecord objects.
    """
    import re
    from urllib.parse import quote_plus
    from pipeline.connectors.base import RawRecord

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.error(
            "Playwright not installed. Run:\n"
            "  python -m pip install playwright\n"
            "  python -m playwright install chromium"
        )
        return []

    records: list[RawRecord] = []
    seen:    set[str]        = set()
    base_url = "https://www.bundesanzeiger.de"

    # Regex: capture any token that ends with a German legal-form suffix
    _NAME_RE = re.compile(
        r"([A-ZÄÖÜ\d][^\n\r\t]{2,80}?"
        r"(?:GmbH|AG|KG|OHG|UG|GbR|eG|SE|e\.K\.)(?:\s*&\s*Co\.?\s*KG)?)",
        re.UNICODE,
    )
    _RN_RE = re.compile(r"\b(HR[AB]|PR|VR)\s*(\d+)\b", re.IGNORECASE)

    logger.info("[ba] Launching headless browser (first run may take a few seconds)...")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page    = await browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )

        debug_dir = Path(__file__).parent / "data"
        debug_dir.mkdir(parents=True, exist_ok=True)

        # ── Step 1: load the search page ─────────────────────────────────────
        logger.info("[ba] Loading search page...")
        try:
            await page.goto(f"{base_url}/pub/de/suche", wait_until="networkidle", timeout=60_000)
        except Exception as exc:
            logger.warning("[ba] Initial load issue: %s", exc)

        await page.wait_for_timeout(2_000)

        # ── Step 2: dismiss cookie/consent dialog ─────────────────────────────
        # The Bundesanzeiger shows "Cookie-Einstellungen" with two buttons.
        # Click the minimal-cookies option to avoid tracking (privacy-friendly).
        for cookie_selector in [
            "button:has-text('Nur technisch notwendige Cookies akzeptieren')",
            "button:has-text('Allen zustimmen')",
            "button:has-text('Akzeptieren')",
            "button:has-text('Einverstanden')",
            "button:has-text('Zustimmen')",
        ]:
            try:
                btn = page.locator(cookie_selector).first
                if await btn.is_visible(timeout=3_000):
                    await btn.click()
                    logger.info("[ba] Dismissed cookie banner")
                    await page.wait_for_timeout(1_500)
                    break
            except Exception:
                continue

        # ── Step 3: fill in the search box ───────────────────────────────────
        try:
            await page.fill("input[placeholder='Suchbegriff eingeben']", query)
            logger.info("[ba] Typed query into search box")
        except Exception as exc:
            logger.error("[ba] Could not find search input: %s", exc)
            await page.screenshot(path=str(debug_dir / "debug_screenshot.png"), full_page=True)
            await browser.close()
            return []

        await page.wait_for_timeout(500)

        # Submit the search — try Enter key first, then button click fallbacks
        submitted = False
        try:
            await page.press("input[placeholder='Suchbegriff eingeben']", "Enter")
            logger.info("[ba] Submitted search via Enter key")
            submitted = True
        except Exception:
            pass

        if not submitted:
            for selector in [
                "button[type='submit']",
                "input[type='submit']",
                "button.search-btn",
                "button.btn-search",
                ".searchButton",
                "form button",
            ]:
                try:
                    await page.click(selector, timeout=3_000)
                    logger.info("[ba] Clicked submit via %s", selector)
                    submitted = True
                    break
                except Exception:
                    continue

        if not submitted:
            logger.error("[ba] Could not submit search form")
            await page.screenshot(path=str(debug_dir / "debug_screenshot.png"), full_page=True)
            await browser.close()
            return []

        # Wait for results to render
        await page.wait_for_timeout(6_000)

        # Save screenshot of the results page
        shot_path = debug_dir / "debug_screenshot.png"
        await page.screenshot(path=str(shot_path), full_page=True)
        logger.info("[ba] Results screenshot saved → %s", shot_path)

        for pg_num in range(max_pages):

            # ── Strategy 1: structured result rows ────────────────────────────
            rows = (
                await page.query_selector_all("table.result_container tr")
                or await page.query_selector_all(".result-list .result-item")
                or await page.query_selector_all("[class*='result'] tr")
                or await page.query_selector_all(".treffer")
                or await page.query_selector_all("article")
            )

            page_companies: list[dict] = []

            if rows:
                for row in rows:
                    try:
                        text = (await row.inner_text()).strip()
                        if not text:
                            continue
                        m = _NAME_RE.search(text)
                        if not m:
                            continue
                        name = m.group(1).strip()
                        if name in seen or len(name) < 4:
                            continue
                        rn = _RN_RE.search(text)
                        page_companies.append({
                            "company_name":    name,
                            "registry_number": f"{rn.group(1).upper()} {rn.group(2)}" if rn else "",
                        })
                        seen.add(name)
                    except Exception:
                        continue

            # ── Strategy 2: full-page text scan (fallback) ────────────────────
            if not page_companies:
                try:
                    full = await page.inner_text("body")
                    for m in _NAME_RE.finditer(full):
                        name = m.group(1).strip()
                        if name in seen or len(name) < 5:
                            continue
                        # Skip obvious navigation / UI strings
                        if any(skip in name for skip in
                               ["Bundesanzeiger", "Suche", "Hilfe", "Impressum",
                                "Datenschutz", "Nutzungsbed"]):
                            continue
                        seen.add(name)
                        page_companies.append({"company_name": name, "registry_number": ""})
                except Exception:
                    pass

            for cd in page_companies:
                sid = hashlib.md5(f"ba:{cd['company_name']}".encode()).hexdigest()
                records.append(RawRecord(
                    source="bundesanzeiger",
                    record_type="filing",
                    raw_data=cd,
                    source_id=sid,
                ))

            logger.info("[ba] Page %d → %d companies (total: %d)",
                        pg_num + 1, len(page_companies), len(records))

            if not page_companies:
                logger.debug("[ba] No results on page %d — stopping", pg_num + 1)
                break

            # Go to next page by clicking the pagination "next" button
            if pg_num < max_pages - 1:
                try:
                    next_btn = page.locator(
                        "a:has-text('Weiter'), a:has-text('nächste'), "
                        "a[aria-label='Nächste Seite'], "
                        "li.next a, .pagination-next a"
                    ).first
                    if await next_btn.is_visible(timeout=2_000):
                        await next_btn.click()
                        await page.wait_for_timeout(4_000)
                    else:
                        break   # no more pages
                except Exception:
                    break

        await browser.close()

    return records


# ─── Source runner ────────────────────────────────────────────────────────────

async def _run_source(source: str, query: str, max_pages: int) -> tuple[int, int]:
    """
    Fetch from one connector, deduplicate against SQLite, and store results.

    Returns:
        (fetched, new_items)  — total records fetched and net-new companies added
    """
    label = _SOURCE_LABELS.get(source, source)
    logger.info("[%s] Searching: %r  (up to %d pages)", label, query, max_pages)

    if source == "oc":
        records = await _oc_fetch(query, max_pages)
    elif source == "ba":
        connector = BundesanzeigerConnector(cfg=_BA_CFG, queue=None)
        try:
            records = await connector.fetch(query=query, max_pages=max_pages)
        finally:
            await connector.close()
    elif source == "ur":
        connector = UnternehmensregisterConnector(cfg=_UR_CFG, queue=None)
        try:
            records = await connector.fetch(query=query, max_pages=max_pages)
        finally:
            await connector.close()
    else:
        raise ValueError(f"Unknown source: {source!r}.  Choose 'oc', 'ba', or 'ur'.")

    fetched   = len(records)
    new_items = 0

    for rec in records:
        if already_seen(rec.dedup_key):
            logger.debug("[%s] Duplicate, skipping: %s", source, rec.source_id)
            continue

        company = _record_to_company(rec)
        if not company["name"]:
            continue

        is_new = upsert_company(company)
        mark_seen(rec.dedup_key)

        if is_new:
            new_items += 1
            rn = company.get("registry_number") or "—"
            logger.info(
                "[%s] + %s  (%s, %s)",
                source,
                company["name"],
                rn,
                company.get("city") or "?",
            )
        else:
            logger.debug("[%s] Updated: %s", source, company["name"])

    log_run(source=source, query=query, fetched=fetched, new_items=new_items)
    logger.info(
        "[%s] Done — %d fetched, %d new",
        label,
        fetched,
        new_items,
    )
    return fetched, new_items


# ─── Financial enrichment ─────────────────────────────────────────────────────

async def _fetch_financials(sync: bool, skip_existing: bool = True) -> None:
    """
    Iterate every company in the SQLite DB, fetch P&L from Bundesanzeiger,
    store locally, and optionally push to Firestore.
    """
    from pipeline.connectors.ba_financials import BAFinancialsFetcher

    companies = get_all_companies()
    if not companies:
        print("\n  No companies in DB — run --query first.\n")
        return

    fetcher = BAFinancialsFetcher()
    updated: dict[str, dict] = {}
    ok = skipped = failed = 0

    print(f"\n  Fetching financials for {len(companies)} companies from Bundesanzeiger…\n")

    for i, company in enumerate(companies, start=1):
        cid  = company["id"]
        name = company["name"]

        if skip_existing and get_financials(cid):
            logger.debug("[fin] Already have financials for %s — skipping", name)
            skipped += 1
            continue

        print(f"  [{i}/{len(companies)}] {name}")
        try:
            data = await fetcher.fetch_financials(
                company_name=name,
                registry_number=company.get("registry_number", ""),
            )
            if data:
                upsert_financials(cid, data)
                updated[cid] = data
                quality = data.get("data_quality", "?")
                rev     = data.get("revenue")
                rev_str = f"  revenue={rev:,.0f}" if rev else "  (no revenue)"
                print(f"      ✓  [{quality}]{rev_str}")
                ok += 1
            else:
                print("      —  not found on Bundesanzeiger")
                failed += 1
        except Exception as exc:
            logger.warning("[fin] Error for %s: %s", name, exc)
            failed += 1

    print(
        f"\n  Done — {ok} fetched, {skipped} skipped (already had data), "
        f"{failed} not found / errored"
    )

    if sync and updated:
        print(f"\n  Syncing {len(updated)} financials to Firestore…")
        written = _sync_financials_to_firestore(updated)
        print(f"  Done — {written} documents updated.\n")
    elif sync and not updated:
        print("\n  Nothing new to sync to Firestore.\n")


# ─── Display helpers ──────────────────────────────────────────────────────────

_SEP  = "═" * 58
_LINE = "─" * 58


def _show_status() -> None:
    stats    = get_run_stats()
    db_path  = Path(__file__).parent / "data" / "pipeline.db"
    last     = stats.get("last_run")

    print(f"\n{_SEP}")
    print("  SearchPulse Pipeline — Status")
    print(_SEP)
    print(f"  Companies in DB :  {stats['total']:,}")
    print(f"  Unsynced        :  {stats['unsynced']:,}")
    print(f"  Total runs      :  {stats['run_count']:,}")
    if last:
        src   = _SOURCE_LABELS.get(last.get("source", ""), last.get("source", "?"))
        q     = last.get("query", "?")
        ft    = last.get("fetched", 0)
        ni    = last.get("new_items", 0)
        ran   = (last.get("ran_at") or "")[:19]
        print(f"  Last run        :  [{src}] {q!r} → {ft} fetched, {ni} new  ({ran})")
    else:
        print("  Last run        :  none yet")
    print(f"  DB file         :  {db_path}")
    print(_SEP)
    print()


def _show_list(n: int) -> None:
    companies = get_recent_companies(n)
    if not companies:
        print("\n  No companies in database yet.  Run with --query first.\n")
        return

    print(f"\n  {n} most recently added companies:\n")
    print(f"  {'Name':<36} {'Type':<14} {'City':<14} {'Src'}")
    print(f"  {_LINE}")
    for c in companies:
        name = (c.get("name") or "")[:35]
        lf   = (c.get("legal_form") or "")[:13]
        city = (c.get("city") or "")[:13]
        src  = (c.get("source") or "")[:3]
        print(f"  {name:<36} {lf:<14} {city:<14} {src}")
    print()


# ─── CLI ──────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python pipeline/run_simple.py",
        description="SearchPulse Pipeline — Docker-free runner (SQLite + Firebase)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  # Fetch German GmbH companies from both sources
  python pipeline/run_simple.py --query "GmbH München"

  # Fetch from Unternehmensregister only, 5 pages (~100 results)
  python pipeline/run_simple.py --query "Bäckerei" --source ur --pages 5

  # Fetch AND immediately push new results to your CRM
  python pipeline/run_simple.py --query "Maschinenbau Bayern" --sync

  # See what's in the database
  python pipeline/run_simple.py --status
  python pipeline/run_simple.py --list 30

  # Push all pending companies to Firestore (without a new fetch)
  python pipeline/run_simple.py --sync-firestore

environment variables (set once, then just run --sync or --sync-firestore):
  FIREBASE_PROJECT_ID          your Firebase project ID
  FIREBASE_CREDENTIALS_PATH    path to serviceAccountKey.json  (default: ./config/serviceAccountKey.json)
  LOG_LEVEL                    DEBUG | INFO | WARNING            (default: INFO)
""",
    )

    p.add_argument(
        "--query", "-q",
        metavar="KEYWORD",
        help="Company name or keyword to search for (required unless --status / --list / --sync-firestore)",
    )
    p.add_argument(
        "--source", "-s",
        choices=["oc", "ba", "ur", "all"],
        default="oc",
        help="Data source: oc=OpenCorporates (default), ba=Bundesanzeiger, ur=Unternehmensregister, all=all three",
    )
    p.add_argument(
        "--pages", "-p",
        type=int,
        default=3,
        metavar="N",
        help="Max result pages per source (each page ≈ 10–20 results, default: 3)",
    )
    p.add_argument(
        "--sync",
        action="store_true",
        help="After fetching, push all new companies to Firestore",
    )
    p.add_argument(
        "--sync-firestore",
        action="store_true",
        help="Push all unsynced companies to Firestore without fetching anything new",
    )
    p.add_argument(
        "--status",
        action="store_true",
        help="Print database statistics and exit",
    )
    p.add_argument(
        "--list", "-l",
        type=int,
        default=0,
        metavar="N",
        help="Print the N most recently added companies and exit",
    )
    p.add_argument(
        "--sync-financials",
        action="store_true",
        help="Push all financials already in SQLite to Firestore (no new fetch)",
    )
    p.add_argument(
        "--financials",
        action="store_true",
        help=(
            "Fetch P&L financials from Bundesanzeiger for all companies in the DB. "
            "Results are stored locally and (with --sync) pushed to Firestore. "
            "Already-fetched companies are skipped; use --refresh-financials to re-fetch."
        ),
    )
    p.add_argument(
        "--refresh-financials",
        action="store_true",
        help="Like --financials but re-fetches even companies that already have data",
    )
    return p


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = _build_parser()
    args   = parser.parse_args()

    # Initialise the SQLite database (creates the file + tables if first run)
    init_db()

    # ── Status only ───────────────────────────────────────────────────────────
    if args.status:
        _show_status()
        return

    # ── List only ─────────────────────────────────────────────────────────────
    if args.list:
        _show_list(args.list)
        return

    # ── Push existing financials to Firestore ─────────────────────────────────
    if args.sync_financials:
        all_fin = get_all_financials()
        if not all_fin:
            print("\n  No financials in DB — run --financials first.\n")
            return
        fin_map = {row["company_id"]: row for row in all_fin}
        print(f"\n  Syncing {len(fin_map)} company financials to Firestore…")
        written = _sync_financials_to_firestore(fin_map)
        print(f"  Done — {written} documents updated.\n")
        return

    # ── Financial enrichment ─────────────────────────────────────────────────
    if args.financials or args.refresh_financials:
        asyncio.run(_fetch_financials(
            sync=args.sync,
            skip_existing=not args.refresh_financials,
        ))
        return

    # ── Sync-only (no fetch) ──────────────────────────────────────────────────
    if args.sync_firestore:
        unsynced = get_unsynced(limit=500)
        if not unsynced:
            print("\n  Nothing to sync — all companies are already in Firestore.\n")
            return
        print(f"\n  Syncing {len(unsynced)} companies to Firestore...")
        written = _sync_to_firestore(unsynced)
        print(f"  Done — wrote {written} documents.\n")
        return

    # ── Fetch ─────────────────────────────────────────────────────────────────
    if not args.query:
        parser.print_help()
        print("\n  error: --query is required for a fetch run.\n")
        sys.exit(1)

    sources       = ["oc", "ba", "ur"] if args.source == "all" else [args.source]
    total_fetched = 0
    total_new     = 0

    for src in sources:
        fetched, new = asyncio.run(_run_source(src, args.query, args.pages))
        total_fetched += fetched
        total_new     += new

    print(
        f"\n  ✓  Fetched {total_fetched} records from "
        f"{', '.join(_SOURCE_LABELS[s] for s in sources)}"
    )
    print(f"     {total_new} new companies added  |  {count_companies():,} total in DB")

    # ── Optional Firestore sync ────────────────────────────────────────────────
    if args.sync:
        unsynced = get_unsynced(limit=500)
        if unsynced:
            print(f"\n  Syncing {len(unsynced)} companies to Firestore...")
            written = _sync_to_firestore(unsynced)
            print(f"  Done — wrote {written} documents.")
        else:
            print("\n  Nothing new to sync.")

    print()


if __name__ == "__main__":
    main()
