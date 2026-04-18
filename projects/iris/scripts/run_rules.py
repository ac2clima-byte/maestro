#!/usr/bin/env python3
"""
Esegue il RuleEngine su tutte le email già presenti in iris_emails (no
fetch EWS, no Anthropic). Idempotente: skippa email con `appliedRules`
già marcato per quella regola.

Modalità:
  --dry-run    Mostra i match senza eseguire side-effect (no Lavagna,
               no archive, no mark applied). Default.
  --apply      Esegue davvero le azioni.

Usage:
  python3 scripts/run_rules.py --dry-run
  python3 scripts/run_rules.py --apply
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
from rule_engine import RuleEngine  # noqa: E402
from pipeline import (  # noqa: E402
    FirestoreActionRunner, load_rules_from_firestore, doc_id_for, COLLECTION,
)


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


class DryRunner:
    """Stampa cosa farebbe senza eseguire scritture."""
    def __init__(self):
        self.calls = []
    def write_lavagna(self, to, message_type, payload, priority, source_email_id):
        self.calls.append(("lavagna", to, message_type, priority))
        return f"DRY-{len(self.calls):03d}"
    def notify_echo(self, channel, text, source_email_id):
        self.calls.append(("echo", channel, text[:60]))
        return f"DRY-{len(self.calls):03d}"
    def archive_email(self, email_id):
        self.calls.append(("archive", email_id))
    def tag_email(self, email_id, tags):
        self.calls.append(("tag", email_id, tags))
    def set_priority(self, email_id, priority):
        self.calls.append(("prio", email_id, priority))
    def mark_rule_applied(self, email_id, rule_id):
        # in dry-run NON segniamo come applicato (così rimane rieseguibile)
        self.calls.append(("mark[skip]", email_id, rule_id))


def main() -> int:
    load_env()
    apply_changes = "--apply" in sys.argv
    dry = not apply_changes

    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")
    print(f"[run] project={project_id} mode={'APPLY' if apply_changes else 'DRY-RUN'}\n", flush=True)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    rules = load_rules_from_firestore(db)
    enabled = [r for r in rules if r.get("enabled")]
    print(f"[run] {len(rules)} regole totali, {len(enabled)} attive.", flush=True)

    runner = DryRunner() if dry else FirestoreActionRunner(db)
    engine = RuleEngine(runner)
    engine.set_rules(rules)

    snaps = list(db.collection(COLLECTION).stream())
    print(f"[run] {len(snaps)} email da valutare.\n", flush=True)

    matched = 0
    by_rule = {}
    for snap in snaps:
        d = snap.to_dict() or {}
        email_for_rules = {
            "id": d.get("id") or snap.id,
            "raw": d.get("raw") or {},
            "classification": d.get("classification") or {},
            "attachments": d.get("attachments") or [],
            "score": d.get("score"),
            "appliedRules": d.get("appliedRules") or [],
        }
        ev = engine.evaluate(email_for_rules)
        rule = ev["matchedRule"]
        if not rule:
            continue
        matched += 1
        by_rule[rule["id"]] = by_rule.get(rule["id"], 0) + 1
        out = engine.execute(email_for_rules, rule, ev.get("extractedData"))
        ok = "✓" if out["ok"] else "✗"
        prefix = "DRY" if dry else "APP"
        subj = (d.get("raw") or {}).get("subject", "")[:55]
        print(f"  {ok} [{prefix}] rule={rule['id']:<32} → {subj}", flush=True)

    print()
    print("=" * 60)
    print(f"Match totali: {matched}/{len(snaps)}")
    for rid, n in sorted(by_rule.items(), key=lambda x: -x[1]):
        print(f"  · {rid}: {n}")
    if dry:
        print()
        print("DRY-RUN: nessuna scrittura su Firestore. Ri-esegui con --apply.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
