#!/usr/bin/env python3
"""
Standalone follow-up pass: re-computes the `followup` field on all existing
iris_emails documents, using Sent Items as the reply oracle.

Does NOT touch the inbox, does NOT call Anthropic. Cheap to re-run.

Usage: python3 update_followup.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import firestore

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_DIR / ".env"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from followup_detector import FollowupDetector  # noqa: E402
from pipeline import fetch_sent, doc_id_for, COLLECTION  # noqa: E402


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

    print(f"[fu] project={project_id}", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    print("[fu] reading existing iris_emails…", flush=True)
    docs = list(db.collection(COLLECTION).stream())
    incoming = []
    for snap in docs:
        d = snap.to_dict() or {}
        raw = d.get("raw") or {}
        cls = d.get("classification") or {}
        incoming.append({
            "id": d.get("id") or snap.id,
            "doc_id": snap.id,
            "sender": raw.get("sender", ""),
            "subject": raw.get("subject", ""),
            "received_time": raw.get("received_time"),
            "category": cls.get("category"),
            "suggestedAction": cls.get("suggestedAction"),
        })
    print(f"     {len(incoming)} email docs.\n", flush=True)

    print("[fu] fetching Sent Items via EWS…", flush=True)
    try:
        sent_items = fetch_sent(max(50, len(incoming) * 3))
        print(f"     {len(sent_items)} sent items.\n", flush=True)
    except Exception as e:
        print(f"     ERROR: {e}", flush=True)
        return 2

    detector_input = [
        {k: v for k, v in e.items() if k != "doc_id"} for e in incoming
    ]
    followups = FollowupDetector(attention_after_hours=48).detect(
        detector_input, sent_items,
    )
    n_fu = sum(1 for v in followups.values() if v["isFollowup"])
    n_attn = sum(1 for v in followups.values() if v["needsAttention"])
    print(f"[fu] {n_fu} follow-up, {n_attn} senza risposta (>48h).\n", flush=True)

    print("[fu] writing followup field back to Firestore…", flush=True)
    for e in incoming:
        fu = followups.get(e["id"])
        if not fu:
            continue
        original_doc_id = (
            doc_id_for(fu["originalEmailId"])
            if fu.get("originalEmailId") else None
        )
        payload = {
            "followup": {
                "isFollowup": bool(fu["isFollowup"]),
                "originalEmailId": fu.get("originalEmailId"),
                "originalDocId": original_doc_id,
                "daysWithoutReply": int(fu.get("daysWithoutReply") or 0),
                "needsAttention": bool(fu["needsAttention"]),
            },
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        db.collection(COLLECTION).document(e["doc_id"]).set(payload, merge=True)
        marker = ""
        if fu["needsAttention"]:
            marker += f" ⏰{fu['daysWithoutReply']}d"
        if fu["isFollowup"]:
            marker += " 🔄"
        if marker:
            print(f"     ✓ {e['doc_id'][:70]:<70}{marker}", flush=True)

    print()
    print("=" * 60)
    print(f"Updated {len(incoming)} docs. {n_fu} follow-up, {n_attn} senza risposta.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
