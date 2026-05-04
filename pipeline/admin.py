"""
pipeline/admin.py
─────────────────
One-off administrative tasks for Search Pulse CRM.

Subcommands
───────────
  verify-owner EMAIL
      Ensures the given email is set as the owner in Firestore
      (`/config/registration.ownerUid`). Idempotent — safe to run any time.

  wipe-user EMAIL
      Permanently deletes the user with this email from Firebase Auth
      and removes all their Firestore data. Refuses to touch the master
      account (UID hard-coded below).

  list-users
      Lists every Firebase Auth user with their email + UID + access
      status from Firestore.

Usage (PowerShell)
──────────────────
  $env:FIREBASE_CREDENTIALS_PATH = "C:\\...\\pipeline\\config\\serviceAccountKey.json"
  python pipeline/admin.py verify-owner rfreudenberg@mba2027.hbs.edu
  python pipeline/admin.py wipe-user richfreude@gmail.com
  python pipeline/admin.py list-users
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

# Hard-coded master account — these CANNOT be wiped, ever.
MASTER_EMAIL = "rfreudenberg@mba2027.hbs.edu"
MASTER_UID   = "TisrYqOVZFfNV8bFjYgVTlO4EAd2"


# ─── Firebase Admin SDK setup ────────────────────────────────────────────────

def _init_firebase():
    """Initialise firebase_admin with the service account."""
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        sys.exit("firebase-admin not installed — run: pip install firebase-admin")

    if firebase_admin._apps:
        return  # already initialised

    creds_path = os.environ.get("FIREBASE_CREDENTIALS_PATH", "")
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "search-pulse")

    if not creds_path or not os.path.exists(creds_path):
        sys.exit(
            "FIREBASE_CREDENTIALS_PATH not set or file missing.\n"
            "Set it to the absolute path of pipeline/config/serviceAccountKey.json"
        )

    cred = credentials.Certificate(creds_path)
    firebase_admin.initialize_app(cred, {"projectId": project_id})


def _db():
    from firebase_admin import firestore
    return firestore.client()


def _auth():
    from firebase_admin import auth
    return auth


# ─── verify-owner ────────────────────────────────────────────────────────────

def cmd_verify_owner(email: str) -> int:
    auth = _auth()
    db   = _db()

    try:
        user = auth.get_user_by_email(email)
    except Exception as e:
        print(f"❌ User not found in Firebase Auth: {email} ({e})")
        return 1

    print(f"  Email: {user.email}")
    print(f"  UID:   {user.uid}")

    # Read /config/registration
    reg_ref  = db.collection("config").document("registration")
    reg_snap = reg_ref.get()
    reg_data = reg_snap.to_dict() if reg_snap.exists else {}

    current_owner = reg_data.get("ownerUid") if reg_data else None

    if current_owner == user.uid:
        print(f"✅ Already the owner — no changes needed")
    else:
        print(f"  Current ownerUid: {current_owner or '(none)'}")
        print(f"  Setting ownerUid = {user.uid}")
        reg_ref.set({
            "hasOwner":      True,
            "ownerUid":      user.uid,
            "ownerEmail":    user.email,
            "registeredAt":  reg_data.get("registeredAt") or datetime.now(timezone.utc).isoformat(),
            "updatedAt":     datetime.now(timezone.utc).isoformat(),
        }, merge=True)
        print(f"✅ Owner set to {user.email}")

    # Make sure the owner has an active access record
    access_ref = db.collection("userAccess").document(user.uid)
    access_ref.set({
        "active":     True,
        "isOwner":    True,
        "email":      user.email,
        "updatedAt":  datetime.now(timezone.utc).isoformat(),
    }, merge=True)
    print(f"✅ /userAccess/{user.uid} marked active + isOwner")
    return 0


# ─── wipe-user ───────────────────────────────────────────────────────────────

def _delete_subcollection(coll_ref, batch_size: int = 200) -> int:
    """Delete every document in a subcollection. Returns count deleted."""
    db = _db()
    total = 0
    while True:
        docs = list(coll_ref.limit(batch_size).stream())
        if not docs:
            break
        batch = db.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()
        total += len(docs)
        if len(docs) < batch_size:
            break
    return total


def cmd_wipe_user(email: str) -> int:
    if email.lower().strip() == MASTER_EMAIL.lower():
        print(f"❌ REFUSED — {MASTER_EMAIL} is the master account and cannot be wiped.")
        return 2

    auth = _auth()
    db   = _db()

    try:
        user = auth.get_user_by_email(email)
    except Exception as e:
        print(f"❌ User not found: {email} ({e})")
        return 1

    if user.uid == MASTER_UID:
        print(f"❌ REFUSED — UID {user.uid} is the hard-coded master UID.")
        return 2

    print(f"  Target: {user.email} (UID: {user.uid})")
    confirm = input(f"  Type 'WIPE' to confirm permanent deletion: ").strip()
    if confirm != "WIPE":
        print("  Aborted.")
        return 0

    # ── 1. Delete every subcollection under /users/{uid}/* ──────────────────
    user_ref = db.collection("users").document(user.uid)
    subs = ["companies", "contacts", "deals", "calls", "notes", "tags",
            "settings", "dealDocuments", "dealNotes", "dealHistory",
            "dealTasks", "dealCalls", "dealDiligence", "pipelineRatings"]
    total = 0
    for s in subs:
        n = _delete_subcollection(user_ref.collection(s))
        if n:
            print(f"  Deleted {n} docs from /users/{user.uid}/{s}")
            total += n
    print(f"  Total Firestore docs deleted: {total}")

    # ── 2. Delete the /users/{uid} doc itself ──
    try:
        user_ref.delete()
        print(f"  Deleted /users/{user.uid}")
    except Exception as e:
        print(f"  Could not delete /users/{user.uid}: {e}")

    # ── 3. Delete /userAccess/{uid} ──
    try:
        db.collection("userAccess").document(user.uid).delete()
        print(f"  Deleted /userAccess/{user.uid}")
    except Exception as e:
        print(f"  Could not delete /userAccess/{user.uid}: {e}")

    # ── 4. Find + deactivate any invite codes used by this user ──
    try:
        used_invites = db.collection("inviteCodes").where("usedByUid", "==", user.uid).stream()
        for inv in used_invites:
            db.collection("inviteCodes").document(inv.id).update({
                "deactivated":   True,
                "deactivatedAt": datetime.now(timezone.utc).isoformat(),
                "wipedReason":   "User account wiped",
            })
            print(f"  Deactivated invite code: {inv.id}")
    except Exception as e:
        print(f"  Could not query invite codes: {e}")

    # ── 5. Delete the Firebase Auth user ──
    try:
        auth.delete_user(user.uid)
        print(f"✅ Deleted Firebase Auth user {user.email}")
    except Exception as e:
        print(f"❌ Could not delete Firebase Auth user: {e}")
        return 1

    print(f"\n✅ User {email} permanently deleted.")
    return 0


# ─── migrate-pipeline ────────────────────────────────────────────────────────

def cmd_migrate_pipeline() -> int:
    """
    Copy every pipeline-sourced company from the master account
    (/users/{MASTER_UID}/companies where source='pipeline') to the new
    SHARED collection (/sharedPipeline/{id}). Idempotent — safe to re-run.
    The originals are LEFT IN PLACE so the master account never loses data.
    """
    db = _db()
    src = db.collection("users").document(MASTER_UID).collection("companies")
    dst = db.collection("sharedPipeline")

    print(f"  Reading from /users/{MASTER_UID}/companies …")
    docs = list(src.where("source", "==", "pipeline").stream())
    print(f"  Found {len(docs)} pipeline companies")

    if not docs:
        print("  Nothing to migrate.")
        return 0

    confirm = input(f"  Copy {len(docs)} companies to /sharedPipeline/? (Y/n): ").strip().lower()
    if confirm and confirm != "y":
        print("  Aborted.")
        return 0

    copied = 0
    skipped = 0
    for d in docs:
        data = d.to_dict() or {}
        cid  = d.id
        # Strip per-user-only fields (interest_score, ai_analysis stay because
        # they're objectively useful for everyone — but if you'd rather wipe,
        # remove them here)
        try:
            dst.document(cid).set(data, merge=True)
            copied += 1
            if copied % 10 == 0:
                print(f"  … {copied}/{len(docs)}")
        except Exception as e:
            print(f"  ❌ {cid}: {e}")
            skipped += 1

    print(f"\n✅ Migrated {copied} companies to /sharedPipeline/")
    if skipped:
        print(f"   ({skipped} failed)")
    print(f"   Originals at /users/{MASTER_UID}/companies are untouched.")
    return 0


# ─── enrich-all ──────────────────────────────────────────────────────────────

def _load_function_env():
    """Read functions/.env (where Cloud Function keys live)."""
    here = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.normpath(os.path.join(here, "..", "functions", ".env"))
    keys = {}
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                keys[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return keys


def _enrich_one(name: str, city: str, hr: str, industry: str,
                tavily_key: str, openai_key: str) -> dict | None:
    """Synchronous enrichment of one company — Tavily search + OpenAI extract."""
    import json
    import requests

    # 1. Tavily search
    query = f"{name}{' ' + city if city else ''} German company website headquarters owners products"
    try:
        tr = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key":        tavily_key,
                "query":          query,
                "search_depth":   "basic",
                "include_answer": True,
                "max_results":    8,
            },
            timeout=30,
        )
        if tr.status_code != 200:
            return None
        tavily = tr.json()
    except Exception as e:
        print(f"    ⚠ tavily error: {e}")
        return None

    ctx = "\n\n".join(
        f"[{i+1}] {r.get('title','')}\n   URL: {r.get('url','')}\n   {(r.get('content','') or '')[:400]}"
        for i, r in enumerate(tavily.get("results", []) or [])
    )

    system_prompt = """You are a research assistant for a search-fund investor analysing German SMEs.
Extract STRUCTURED information about the target company from the web-search results provided.

Return ONLY valid JSON with this exact schema (use null for any field you cannot reliably determine):
{
  "website": "https://www.example.de" or null,
  "hq_address": "Street, Postcode City, Country" or null,
  "city": "Munich" or null,
  "founded_year": 1995 or null,
  "ownership_type": "Family-owned" | "PE-backed" | "Public" | "Subsidiary" | "Independent" | "Unknown",
  "key_executives": [{"name": "Anna Müller", "role": "CEO"}],
  "products_services": "1-2 sentence description",
  "main_customers": "Brief description",
  "recent_news": ["Headline (year)"],
  "estimated_revenue_eur": 15000000 or null,
  "estimated_revenue_year": 2023 or null,
  "estimated_employees": 120 or null,
  "estimates_confidence": "high" | "medium" | "low" | "none"
}

Be conservative. Use null when uncertain. Limit news to 3, executives to 4."""

    user_prompt = (
        f"**Company:** {name}\n"
        + (f"**City:** {city}\n" if city else "")
        + (f"**HR Number:** {hr}\n" if hr else "")
        + (f"**Industry:** {industry}\n" if industry else "")
        + f"\n**Web search results:**\n{ctx or '(no results)'}\n"
        + (f"\n**Quick answer:** {tavily.get('answer','')}\n" if tavily.get("answer") else "")
        + "\nExtract the structured information now."
    )

    try:
        ar = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {openai_key}",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                "response_format": {"type": "json_object"},
                "max_tokens":  900,
                "temperature": 0.1,
            },
            timeout=60,
        )
        if ar.status_code != 200:
            return None
        ai = ar.json()
        enrichment = json.loads(ai["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"    ⚠ openai error: {e}")
        return None

    sources = [
        {"title": r.get("title", ""), "url": r.get("url", "")}
        for r in (tavily.get("results") or [])[:6]
    ]
    return {"enrichment": enrichment, "sources": sources}


def cmd_enrich_all(skip_existing: bool = True, max_workers: int = 5) -> int:
    """
    Run AI enrichment on every /sharedPipeline company that hasn't been
    enriched yet. Reads OPENAI_KEY and TAVILY_KEY from functions/.env.
    Runs `max_workers` requests in parallel for speed.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from datetime import datetime, timezone

    env = _load_function_env()
    tavily_key = env.get("TAVILY_KEY", "")
    openai_key = env.get("OPENAI_KEY", "")

    if not tavily_key or not openai_key:
        print("❌ Missing TAVILY_KEY or OPENAI_KEY in functions/.env")
        return 1

    db = _db()
    coll = db.collection("sharedPipeline")

    print("  Loading companies from /sharedPipeline …")
    docs = list(coll.stream())
    print(f"  Total: {len(docs)}")

    todo = []
    for d in docs:
        data = d.to_dict() or {}
        if skip_existing and data.get("_pipeline", {}).get("enrichment"):
            continue
        todo.append((d.id, data))

    print(f"  Need to enrich: {len(todo)} (skipping {len(docs) - len(todo)} already done)")
    if not todo:
        print("✅ Nothing to do — all companies already enriched.")
        return 0

    confirm = input(
        f"  This will use ~{len(todo)} Tavily searches and OpenAI calls. Continue? (Y/n): "
    ).strip().lower()
    if confirm and confirm != "y":
        print("  Aborted.")
        return 0

    done_count = 0
    fail_count = 0

    def _worker(item):
        cid, data = item
        result = _enrich_one(
            name     = data.get("name", ""),
            city     = data.get("location", "") or "",
            hr       = data.get("hrNumber", "") or "",
            industry = data.get("industry", "") or "",
            tavily_key=tavily_key, openai_key=openai_key,
        )
        if not result:
            return cid, None
        try:
            coll.document(cid).set({
                "_pipeline": {
                    "enrichment":         result["enrichment"],
                    "enrichment_sources": result["sources"],
                    "enrichment_at":      datetime.now(timezone.utc).isoformat(),
                    "enrichment_by":      "bulk-script",
                },
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }, merge=True)
        except Exception as e:
            print(f"    ⚠ firestore write failed for {cid}: {e}")
            return cid, None
        return cid, result["enrichment"]

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(_worker, item) for item in todo]
        for f in as_completed(futures):
            cid, enr = f.result()
            if enr:
                done_count += 1
                website = enr.get("website") or "—"
                city = enr.get("city") or enr.get("hq_address", "")[:40] or "—"
                rev  = enr.get("estimated_revenue_eur")
                rev_str = f"€{rev/1_000_000:.1f}M" if rev else "—"
                print(f"  [{done_count}/{len(todo)}] {cid[:30]:<30} city={city[:25]:<25} rev={rev_str:<8} web={website[:40]}")
            else:
                fail_count += 1
                print(f"  [×] {cid[:30]} — failed")

    print(f"\n✅ Done — {done_count} enriched, {fail_count} failed")
    return 0


# ─── list-users ──────────────────────────────────────────────────────────────

def cmd_list_users() -> int:
    auth = _auth()
    db   = _db()

    print(f"\n{'Email':<40} {'UID':<32} Status")
    print("─" * 90)

    page = auth.list_users()
    for user in page.iterate_all():
        access_doc = db.collection("userAccess").document(user.uid).get()
        if access_doc.exists:
            data   = access_doc.to_dict() or {}
            status = ("OWNER"  if data.get("isOwner") else
                      "active" if data.get("active") is not False else
                      "REVOKED")
        else:
            status = "(no access record)"

        flag = " ⚠ MASTER" if user.uid == MASTER_UID else ""
        print(f"{user.email:<40} {user.uid:<32} {status}{flag}")

    return 0


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Search Pulse CRM admin tools")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_verify = sub.add_parser("verify-owner", help="Ensure email is set as Firestore owner")
    p_verify.add_argument("email")

    p_wipe = sub.add_parser("wipe-user", help="Permanently delete a user (refuses master)")
    p_wipe.add_argument("email")

    sub.add_parser("list-users", help="List all Firebase Auth users")
    sub.add_parser("migrate-pipeline",
                   help="Copy master's pipeline companies to /sharedPipeline (one-time)")
    p_enrich = sub.add_parser("enrich-all",
                              help="Run AI web research for every company in /sharedPipeline")
    p_enrich.add_argument("--all", action="store_true",
                          help="Re-run enrichment even if already done (default skips done)")
    p_enrich.add_argument("--workers", type=int, default=5,
                          help="Parallel requests (default 5)")

    args = ap.parse_args()
    _init_firebase()

    if args.cmd == "verify-owner":     return cmd_verify_owner(args.email)
    if args.cmd == "wipe-user":        return cmd_wipe_user(args.email)
    if args.cmd == "list-users":       return cmd_list_users()
    if args.cmd == "migrate-pipeline": return cmd_migrate_pipeline()
    if args.cmd == "enrich-all":
        return cmd_enrich_all(skip_existing=not args.all, max_workers=args.workers)
    return 1


if __name__ == "__main__":
    sys.exit(main())
