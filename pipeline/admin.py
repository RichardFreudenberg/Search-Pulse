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

    args = ap.parse_args()
    _init_firebase()

    if args.cmd == "verify-owner": return cmd_verify_owner(args.email)
    if args.cmd == "wipe-user":    return cmd_wipe_user(args.email)
    if args.cmd == "list-users":   return cmd_list_users()
    return 1


if __name__ == "__main__":
    sys.exit(main())
