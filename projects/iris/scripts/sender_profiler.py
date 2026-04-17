#!/usr/bin/env python3
"""
SenderProfiler — aggrega per mittente le email in iris_emails e scrive il
profilo in iris_sender_profiles.

Profilo per mittente:
  - email (chiave normalizzata, lowercase)
  - displayName: nome più frequente visto sul mittente (raw.sender_name)
  - totalEmails: count
  - firstEmailAt, lastEmailAt: ISO 8601 UTC
  - daysActive: giorni tra prima e ultima email (>=1)
  - avgPerWeek: emails / (daysActive/7)
  - lastContactDaysAgo: giorni dall'ultimo contatto fino a now
  - topCategories: dict {CATEGORIA: count} ordinato desc, top 5
  - topCategoriesPct: dict {CATEGORIA: percentuale} top 5
  - condominiosMentioned: lista condomini distinti estratti da entities
  - avgSentiment: sentiment dominante (più frequente)
  - sentimentDistribution: dict {sentiment: count}
  - isFrequent: bool, totalEmails > 5

Doc id Firestore = stesso safe_id usato altrove (max 150 char, [a-zA-Z0-9._-]).

Idempotente: rieseguendo riscrive i profili dai dati attuali. Niente accumulo
di stato pregresso.

Usage: python3 sender_profiler.py
"""
from __future__ import annotations

import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import firestore

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_DIR / ".env"

EMAILS_COLLECTION = "iris_emails"
PROFILES_COLLECTION = "iris_sender_profiles"

FREQUENT_THRESHOLD = 5  # > soglia → isFrequent


def load_env() -> None:
    if not ENV_PATH.exists():
        raise RuntimeError(f"Missing {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def _norm_addr(addr: str | None) -> str:
    return (addr or "").strip().lower()


def _safe_id(raw: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", raw).strip("_")
    return safe[:150] or "sender_unknown"


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def build_profiles(docs: list[dict], now: datetime | None = None) -> list[dict]:
    """Pure aggregation, testable."""
    now = now or datetime.now(timezone.utc)
    by_sender: dict[str, list[dict]] = defaultdict(list)

    for d in docs:
        raw = d.get("raw") or {}
        sender = _norm_addr(raw.get("sender"))
        if not sender:
            continue
        by_sender[sender].append({
            "received": _parse_dt(raw.get("received_time")),
            "sender_name": raw.get("sender_name") or "",
            "category": (d.get("classification") or {}).get("category") or "ALTRO",
            "sentiment": (d.get("classification") or {}).get("sentiment") or "neutro",
            "condominio": ((d.get("classification") or {}).get("entities") or {}).get("condominio"),
        })

    profiles = []
    for sender, items in by_sender.items():
        items_with_dt = [it for it in items if it["received"]]
        items_sorted = sorted(items_with_dt, key=lambda x: x["received"])
        first_at = items_sorted[0]["received"] if items_sorted else None
        last_at = items_sorted[-1]["received"] if items_sorted else None

        if first_at and last_at:
            days_active = max(1, int((last_at - first_at).total_seconds() // 86400) + 1)
        else:
            days_active = 1
        avg_per_week = round(len(items) / (days_active / 7.0), 2) if days_active else 0.0
        last_contact_days_ago = (
            int((now - last_at).total_seconds() // 86400) if last_at else None
        )

        cat_counter = Counter(it["category"] for it in items)
        top_categories = dict(cat_counter.most_common(5))
        total = sum(top_categories.values()) or 1
        top_categories_pct = {k: round(100 * v / len(items), 1) for k, v in top_categories.items()}

        sent_counter = Counter(it["sentiment"] for it in items)
        avg_sentiment = sent_counter.most_common(1)[0][0] if sent_counter else "neutro"

        condos = sorted({
            it["condominio"].strip() for it in items
            if it["condominio"] and isinstance(it["condominio"], str) and it["condominio"].strip()
        })

        # display name = nome più frequente non vuoto (fallback sender)
        names = Counter(
            it["sender_name"].strip() for it in items if it["sender_name"]
        )
        display_name = names.most_common(1)[0][0] if names else sender

        profiles.append({
            "id": _safe_id(sender),
            "email": sender,
            "displayName": display_name,
            "totalEmails": len(items),
            "firstEmailAt": first_at.isoformat() if first_at else None,
            "lastEmailAt": last_at.isoformat() if last_at else None,
            "daysActive": days_active,
            "avgPerWeek": avg_per_week,
            "lastContactDaysAgo": last_contact_days_ago,
            "topCategories": top_categories,
            "topCategoriesPct": top_categories_pct,
            "condominiosMentioned": condos,
            "avgSentiment": avg_sentiment,
            "sentimentDistribution": dict(sent_counter),
            "isFrequent": len(items) > FREQUENT_THRESHOLD,
        })
    return profiles


def main() -> int:
    load_env()
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")

    print(f"[profiler] project={project_id}", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    print(f"[profiler] reading {EMAILS_COLLECTION}…", flush=True)
    snaps = list(db.collection(EMAILS_COLLECTION).stream())
    docs = [s.to_dict() for s in snaps if s.to_dict()]
    print(f"           {len(docs)} email docs.\n", flush=True)

    profiles = build_profiles(docs)
    profiles.sort(key=lambda p: p["totalEmails"], reverse=True)
    print(f"[profiler] {len(profiles)} profili distinti, "
          f"{sum(1 for p in profiles if p['isFrequent'])} frequenti (>{FREQUENT_THRESHOLD}).\n",
          flush=True)

    print(f"[profiler] writing to {PROFILES_COLLECTION}…", flush=True)
    now = firestore.SERVER_TIMESTAMP
    for p in profiles:
        ref = db.collection(PROFILES_COLLECTION).document(p["id"])
        snap = ref.get()
        payload = dict(p)
        payload["updatedAt"] = now
        if not snap.exists:
            payload["createdAt"] = now
        ref.set(payload, merge=True)
        marker = " ⭐" if p["isFrequent"] else ""
        cats = ", ".join(f"{k}({v})" for k, v in list(p["topCategories"].items())[:3])
        print(
            f"           ✓ {p['email'][:45]:<45}  "
            f"n={p['totalEmails']:<3} {p['avgSentiment']:<11} "
            f"[{cats}]{marker}",
            flush=True,
        )

    print()
    print("=" * 60)
    print(f"Profili scritti: {len(profiles)}.")
    print(f"Console: https://console.firebase.google.com/project/{project_id}/firestore/data/~2F{PROFILES_COLLECTION}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
