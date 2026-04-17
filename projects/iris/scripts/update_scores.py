#!/usr/bin/env python3
"""
Standalone score pass: ricalcola il campo `score` su tutti i doc esistenti in
iris_emails dai campi già presenti (classification, followup, attachments).
Niente fetch EWS, niente Anthropic. Idempotente, costo zero.

Usage: python3 update_scores.py
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
from score_calculator import compute_score  # noqa: E402

COLLECTION = "iris_emails"


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
    print(f"[score] project={project_id}", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    snaps = list(db.collection(COLLECTION).stream())
    print(f"[score] {len(snaps)} doc da processare\n", flush=True)

    updated = 0
    histogram = {}
    for s in snaps:
        d = s.to_dict() or {}
        score = compute_score(d)
        bucket = (score // 10) * 10
        histogram[bucket] = histogram.get(bucket, 0) + 1
        db.collection(COLLECTION).document(s.id).set(
            {"score": score, "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        updated += 1
        if score >= 50:
            cls = (d.get("classification") or {}).get("category") or "?"
            print(f"     ✓ score={score:3d}  {cls:<28} {s.id[:50]}", flush=True)

    print()
    print("=" * 60)
    print(f"Aggiornati {updated} doc.")
    print("Distribuzione score:")
    for bucket in sorted(histogram):
        bar = "█" * histogram[bucket]
        print(f"  {bucket:>3}-{bucket+9:<3}  {histogram[bucket]:>3}  {bar}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
