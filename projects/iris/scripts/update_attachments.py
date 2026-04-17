#!/usr/bin/env python3
"""
Standalone attachment pass: per ogni doc in iris_emails con has_attachments=True,
ri-fetcha l'item EWS, estrae metadata + tag tipo + testo PDF e scrive il
campo `attachments[]` sul doc. Niente Anthropic, idempotente.

Usage: python3 update_attachments.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import firestore
from exchangelib.errors import ErrorItemNotFound

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_DIR / ".env"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import _make_account, _extract_attachments, COLLECTION  # noqa: E402


def load_env() -> None:
    if not ENV_PATH.exists():
        raise RuntimeError(f"Missing {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    load_env()
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")
    print(f"[att] project={project_id}", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    print("[att] reading iris_emails…", flush=True)
    snaps = list(db.collection(COLLECTION).stream())
    docs = [(s.id, s.to_dict() or {}) for s in snaps]
    targets = [
        (doc_id, d) for doc_id, d in docs
        if (d.get("raw") or {}).get("has_attachments")
    ]
    print(f"     {len(docs)} doc totali, {len(targets)} con allegati.\n", flush=True)

    if not targets:
        print("[att] nessun doc con allegati.")
        return 0

    print("[att] connessione EWS + lookup attachments…", flush=True)
    account = _make_account()

    written = 0
    skipped = 0
    for doc_id, d in targets:
        raw = d.get("raw") or {}
        msg_id = d.get("id") or raw.get("message_id")
        if not msg_id:
            skipped += 1
            continue
        # exchangelib: cerca per message_id (filter)
        try:
            items = list(
                account.inbox.filter(message_id=msg_id)
                .only(
                    "id", "message_id", "subject", "has_attachments", "attachments",
                )[:1]
            )
        except Exception as e:
            print(f"     ! lookup fallito per {doc_id[:60]}: {e}", flush=True)
            skipped += 1
            continue
        if not items:
            print(f"     ! item non trovato in inbox: {doc_id[:60]}", flush=True)
            skipped += 1
            continue

        try:
            atts = _extract_attachments(items[0])
        except Exception as e:
            print(f"     ! extract fallito per {doc_id[:60]}: {e}", flush=True)
            skipped += 1
            continue

        db.collection(COLLECTION).document(doc_id).set(
            {"attachments": atts, "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        types = ", ".join(a["detectedType"] for a in atts) or "—"
        print(f"     ✓ {doc_id[:60]:<60} {len(atts)} att [{types}]", flush=True)
        written += 1

    print()
    print("=" * 60)
    print(f"Aggiornati {written} doc. Skipped {skipped}.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
