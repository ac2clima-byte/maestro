#!/usr/bin/env python3
"""
SimilarityFinder — per ogni email in iris_emails, trova email "simili"
storiche e scrive il campo `similarEmails[]` sul doc.

Match (entrambe le condizioni):
  1) stessa `classification.category`
  2) stesso mittente (raw.sender, normalized) OPPURE stesso condominio
     (classification.entities.condominio, normalized)
  3) ricevute negli ultimi 6 mesi rispetto alla email corrente
  4) escludendo la email stessa

Output (max 5 match, ordinati dal più recente):
  similarEmails: [{
    emailId,        # message_id originale
    docId,          # firestore doc id (per linking PWA)
    date,           # ISO 8601
    summary,        # classification.summary (clipped)
    matchKey,       # "sender" | "condominio" | "sender+condominio"
    howHandled: {
      suggestedAction,
      repliedInDays | null,
      attentionStatus,         # "replied" | "no_reply_yet" | "needs_attention"
      wasCorrected,
      correctedCategory | null,
      correctedAction | null,
    }
  }]

Idempotente. Niente Anthropic, solo Firestore reads/writes.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import firestore

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_DIR / ".env"
EMAILS_COLLECTION = "iris_emails"
WINDOW_MONTHS = 6
MAX_MATCHES = 5
SUMMARY_CLIP = 240


def load_env() -> None:
    if not ENV_PATH.exists():
        raise RuntimeError(f"Missing {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


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


def _how_handled(doc: dict) -> dict:
    cls = doc.get("classification") or {}
    fu = doc.get("followup") or {}
    corr = doc.get("correction") or {}

    if fu.get("needsAttention"):
        attention_status = "needs_attention"
    elif fu and fu.get("daysWithoutReply") is not None and not fu.get("isFollowup"):
        # nessun flag attention ma abbiamo dati di reply oracle
        # se daysWithoutReply > 0 e needsAttention=False potrebbe essere risposta
        # oppure no-reply category. Determiniamo:
        if fu.get("needsAttention") is False and fu.get("daysWithoutReply", 0) >= 0:
            attention_status = "replied" if fu.get("daysWithoutReply") is not None else "no_reply_yet"
        else:
            attention_status = "no_reply_yet"
    else:
        attention_status = "unknown"

    # repliedInDays: se needsAttention è False e daysWithoutReply è basso,
    # è probabile che sia "risposto in N giorni". Non abbiamo modo di
    # distinguere con certezza senza riscriversi l'oracle, ma il campo
    # daysWithoutReply nel pipeline rappresenta "giorni fino alla risposta
    # o fino a now". Se needsAttention=False e categoria richiedeva risposta,
    # è "risposto entro N giorni".
    replied_in_days = None
    if fu.get("needsAttention") is False and fu.get("daysWithoutReply") is not None:
        replied_in_days = int(fu.get("daysWithoutReply") or 0)

    return {
        "suggestedAction": cls.get("suggestedAction"),
        "repliedInDays": replied_in_days,
        "attentionStatus": attention_status,
        "wasCorrected": bool(corr),
        "correctedCategory": corr.get("correctedCategory") or corr.get("category"),
        "correctedAction": corr.get("correctedAction") or corr.get("suggestedAction"),
    }


def find_similar_for(target: dict, all_docs: list[dict]) -> list[dict]:
    """
    target: doc dict (must include `id`, `classification`, `raw`).
    all_docs: pool of doc dicts (must each carry `_doc_id` field).
    """
    target_cls = target.get("classification") or {}
    target_cat = target_cls.get("category")
    if not target_cat:
        return []

    target_ent = target_cls.get("entities") or {}
    target_raw = target.get("raw") or {}
    target_sender = _norm(target_raw.get("sender"))
    target_condo = _norm(target_ent.get("condominio"))
    target_id = target.get("id")
    target_dt = _parse_dt(target_raw.get("received_time"))
    if not target_dt:
        return []
    window_start = target_dt - timedelta(days=30 * WINDOW_MONTHS)

    matches = []
    for d in all_docs:
        if d.get("id") == target_id:
            continue
        d_cls = d.get("classification") or {}
        if d_cls.get("category") != target_cat:
            continue
        d_raw = d.get("raw") or {}
        d_sender = _norm(d_raw.get("sender"))
        d_condo = _norm((d_cls.get("entities") or {}).get("condominio"))

        same_sender = bool(target_sender and d_sender == target_sender)
        same_condo = bool(target_condo and d_condo == target_condo)
        if not (same_sender or same_condo):
            continue

        d_dt = _parse_dt(d_raw.get("received_time"))
        if not d_dt or not (window_start <= d_dt <= target_dt):
            continue

        if same_sender and same_condo:
            match_key = "sender+condominio"
        elif same_sender:
            match_key = "sender"
        else:
            match_key = "condominio"

        summary = (d_cls.get("summary") or "")[:SUMMARY_CLIP]
        matches.append({
            "emailId": d.get("id"),
            "docId": d.get("_doc_id"),
            "date": d_dt.isoformat(),
            "summary": summary,
            "matchKey": match_key,
            "howHandled": _how_handled(d),
        })

    matches.sort(key=lambda m: m["date"], reverse=True)
    return matches[:MAX_MATCHES]


def main() -> int:
    load_env()
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")

    print(f"[similarity] project={project_id}", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    print("[similarity] reading iris_emails…", flush=True)
    snaps = list(db.collection(EMAILS_COLLECTION).stream())
    docs = []
    for s in snaps:
        d = s.to_dict() or {}
        d["_doc_id"] = s.id
        docs.append(d)
    print(f"             {len(docs)} email docs.\n", flush=True)

    print("[similarity] computing similarities (window 6 mesi, max 5 match)…", flush=True)
    n_with_matches = 0
    n_total_matches = 0
    now = firestore.SERVER_TIMESTAMP
    for d in docs:
        matches = find_similar_for(d, docs)
        n_total_matches += len(matches)
        if matches:
            n_with_matches += 1
        payload = {
            "similarEmails": matches,
            "updatedAt": now,
        }
        db.collection(EMAILS_COLLECTION).document(d["_doc_id"]).set(payload, merge=True)
        if matches:
            keys = ", ".join(m["matchKey"] for m in matches[:3])
            print(
                f"     ✓ {d['_doc_id'][:60]:<60}  matches={len(matches)} [{keys}]",
                flush=True,
            )

    print()
    print("=" * 60)
    print(f"Aggiornati {len(docs)} doc. {n_with_matches} hanno match. Totale match scritti: {n_total_matches}.")
    print(f"Console: https://console.firebase.google.com/project/{project_id}/firestore/data/~2F{EMAILS_COLLECTION}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
