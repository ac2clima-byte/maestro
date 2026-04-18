#!/usr/bin/env python3
"""
Seed delle 4 regole IRIS predefinite nella collection iris_rules.

Le regole sono identificate da `id` deterministico (riusabile):
  - rule_incassi_acg_malvicino
  - rule_newsletter_spam
  - rule_pec_ufficiale
  - rule_guasto_urgente

Idempotente: rieseguendo aggiorna `name/description/conditions/actions/
priority` ma preserva `enabled` se l'utente l'ha modificato dalla PWA.
Su prima creazione, default `enabled=True`.

Usage:
  python3 scripts/seed_rules.py             # seed/upsert con preserve enabled
  python3 scripts/seed_rules.py --force     # sovrascrive anche enabled
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import firestore

PROJECT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_DIR / ".env"
COLLECTION = "iris_rules"


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


SEED_RULES = [
    {
        "id": "rule_guasto_urgente",
        "name": "Guasto urgente → ARES",
        "description": (
            "Tutte le email classificate GUASTO_URGENTE vengono notificate ad "
            "ARES (operativo) con priorità critical, e ECHO manda un alert WA "
            "ad Alberto."
        ),
        "enabled": True,
        "priority": 100,
        "stopOnMatch": True,
        "conditions": [
            {"field": "category", "op": "equals", "value": "GUASTO_URGENTE"},
        ],
        "actions": [
            {
                "type": "write_lavagna",
                "to": "ares",
                "messageType": "richiesta_intervento_urgente",
                "priority": "critical",
                "payload": {"trigger": "iris_classifier"},
            },
            {
                "type": "notify_echo",
                "channel": "wa",
                "text": "🚨 IRIS: GUASTO URGENTE in arrivo, controlla.",
            },
            {"type": "set_priority", "priority": "critical"},
        ],
    },
    {
        "id": "rule_pec_ufficiale",
        "name": "PEC ufficiale → DIKEA",
        "description": (
            "PEC vengono inoltrate a DIKEA (compliance). ECHO notifica Alberto."
        ),
        "enabled": True,
        "priority": 90,
        "stopOnMatch": True,
        "conditions": [
            {"field": "category", "op": "equals", "value": "PEC_UFFICIALE"},
        ],
        "actions": [
            {
                "type": "write_lavagna",
                "to": "dikea",
                "messageType": "pec_in_arrivo",
                "priority": "high",
                "payload": {"trigger": "iris_classifier"},
            },
            {
                "type": "notify_echo",
                "channel": "wa",
                "text": "📜 IRIS: PEC ufficiale ricevuta, DIKEA presa in carico.",
            },
        ],
    },
    {
        "id": "rule_incassi_acg_malvicino",
        "name": "Incassi ACG da Malvicino → CHARTA",
        "description": (
            "Email da Malvicino su incassi ACG: estrai importo, manda a CHARTA "
            "(amministrativo), notifica ECHO, archivia in IRIS (l'azione è in "
            "carico al collega ammin.)."
        ),
        "enabled": True,
        "priority": 80,
        "stopOnMatch": True,
        "conditions": [
            {"field": "sender", "op": "contains", "value": "malvicino"},
            {"field": "subject", "op": "contains", "value": "incassi"},
        ],
        "actions": [
            {
                "type": "extract_data",
                "extractPatterns": {
                    "importo": r"€\s*([0-9.,]+)",
                    "periodo": r"(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s*\d{0,4}",
                },
            },
            {
                "type": "write_lavagna",
                "to": "charta",
                "messageType": "incassi_acg",
                "priority": "normal",
                "payload": {"trigger": "iris_classifier", "fonte": "malvicino"},
            },
            {
                "type": "notify_echo",
                "channel": "wa",
                "text": "💰 IRIS: nuovo riepilogo incassi da Malvicino, passato a CHARTA.",
            },
            {"type": "archive_email"},
        ],
    },
    {
        "id": "rule_newsletter_spam",
        "name": "Newsletter / spam → archivia",
        "description": (
            "Email classificate NEWSLETTER_SPAM vengono archiviate "
            "automaticamente. Nessun Collega coinvolto."
        ),
        "enabled": True,
        "priority": 10,
        "stopOnMatch": True,
        "conditions": [
            {"field": "category", "op": "equals", "value": "NEWSLETTER_SPAM"},
        ],
        "actions": [
            {"type": "archive_email"},
        ],
    },
]


def main() -> int:
    load_env()
    force = "--force" in sys.argv
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")
    print(f"[seed] project={project_id} force={force}", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    now = firestore.SERVER_TIMESTAMP
    written = 0
    for rule in SEED_RULES:
        rid = rule["id"]
        ref = db.collection(COLLECTION).document(rid)
        snap = ref.get()
        existing = snap.to_dict() if snap.exists else None

        payload = dict(rule)
        payload["updatedAt"] = now
        if not existing:
            payload["createdAt"] = now
            print(f"  + create {rid}", flush=True)
        else:
            # preserve enabled unless --force
            if not force and "enabled" in existing:
                payload["enabled"] = bool(existing["enabled"])
                preserved = " (enabled preservato)" if existing["enabled"] != rule["enabled"] else ""
            else:
                preserved = ""
            print(f"  ~ update {rid}{preserved}", flush=True)
        ref.set(payload, merge=True)
        written += 1

    print()
    print("=" * 60)
    print(f"Seed completato: {written} regole.")
    print(f"Console: https://console.firebase.google.com/project/{project_id}/firestore/data/~2F{COLLECTION}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
