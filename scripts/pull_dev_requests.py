#!/usr/bin/env python3
"""
pull_dev_requests.py — Trasforma nuove dev requests da Firestore in file
tasks/dev-request-<timestamp>.md nel repo locale, committa e pusha.

MAESTRO (maestro.mjs) NON deve eseguire questi file come task normali:
il prefisso "dev-request-" è il segnale di skip.

Claude Chat (in un'altra sessione) farà git pull e li vedrà; discussione + se
approvato, scrive un task normale di esecuzione (senza prefisso).

Uso:
  python3 scripts/pull_dev_requests.py         # sync + commit + push
  python3 scripts/pull_dev_requests.py --dry   # solo stampa cosa farebbe
"""

from __future__ import annotations

import os
import re
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import firestore


REPO = Path(__file__).resolve().parent.parent
TASKS_DIR = REPO / "tasks"


def safe_slug(s: str, maxlen: int = 40) -> str:
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    s = re.sub(r"\s+", "-", s)
    return s[:maxlen]


def format_dev_request_md(doc: dict) -> str:
    ts = doc.get("createdAt")
    ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
    lines = [
        "# Dev Request — Analisi richiesta (NON ESEGUIRE)",
        "",
        "> **Istruzione per Claude Code / MAESTRO**: NON implementare questa modifica.",
        "> Il file ha prefisso `dev-request-` → MAESTRO lo SKIPPA.",
        "> Claude Chat (sessione Alberto) legge, discute, e se approvato crea un task di esecuzione.",
        "",
        f"**ID Firestore**: `{doc.get('id', '?')}`",
        f"**Data**: {ts_str}",
        f"**User**: {doc.get('userId') or '(n/a)'}",
        f"**Session**: {doc.get('sessionId') or '(n/a)'}",
        f"**Source**: {doc.get('source') or 'nexus_chat'}",
        f"**Stato**: {doc.get('status') or 'pending'}",
        "",
        "## Richiesta originale",
        "",
        "> " + (doc.get("description") or "").replace("\n", "\n> "),
        "",
        "## Prossimo passo",
        "",
        "Claude Chat: leggi questa richiesta, discuti con Alberto l'approccio, e se approvato crea",
        "un task di esecuzione in `tasks/<slug>.md` (senza prefisso `dev-request-`).",
        "",
    ]
    return "\n".join(lines) + "\n"


def run(cmd, cwd=None, check=True):
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=True)


def main():
    dry = "--dry" in sys.argv

    try:
        firebase_admin.initialize_app(options={"projectId": "nexo-hub-15f2d"})
    except ValueError:
        pass
    db = firestore.client()

    TASKS_DIR.mkdir(exist_ok=True)
    existing = {p.name for p in TASKS_DIR.glob("dev-request-*.md")}
    print(f"[sync] tasks/ contiene già {len(existing)} dev-request-*.md")

    # Leggi tutte le dev requests status=pending
    snap = db.collection("nexo_dev_requests").where("status", "==", "pending").limit(100).get()
    new_files = []
    for d in snap:
        v = d.to_dict() or {}
        v["id"] = d.id
        ts = v.get("createdAt")
        ts_ms = int(ts.timestamp() * 1000) if hasattr(ts, "timestamp") else 0
        slug = safe_slug(v.get("description", ""), 40) or "no-desc"
        fname = f"dev-request-{ts_ms}-{slug}.md"
        if fname in existing:
            continue
        path = TASKS_DIR / fname
        content = format_dev_request_md(v)
        if dry:
            print(f"[dry] would write {path}")
        else:
            path.write_text(content, encoding="utf-8")
            new_files.append(str(path.relative_to(REPO)))
            print(f"[sync] written {path.relative_to(REPO)}")

    if dry or not new_files:
        print(f"[sync] done (new={len(new_files)})")
        return

    # git add + commit + push
    try:
        run(["git", "add", "tasks/"], cwd=REPO)
        msg = f"feat(dev-requests): sync {len(new_files)} new request(s) from NEXUS"
        run(["git", "commit", "-m", msg], cwd=REPO)
        print(f"[git] commit: {msg}")
        r = run(["git", "push", "origin", "HEAD"], cwd=REPO, check=False)
        if r.returncode == 0:
            print("[git] push ok")
        else:
            print(f"[git] push WARNING (rc={r.returncode}):", r.stderr.strip()[:200])
    except subprocess.CalledProcessError as e:
        stderr = (e.stderr or "").strip()[:300]
        if "nothing to commit" in stderr.lower():
            print("[git] nothing to commit")
        else:
            print(f"[git] ERROR: {stderr}")


if __name__ == "__main__":
    main()
