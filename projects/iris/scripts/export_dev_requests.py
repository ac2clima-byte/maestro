#!/usr/bin/env python3
"""
Esporta le dev requests "pending" da Firestore (collection nexo_dev_requests)
verso file task per MAESTRO sotto ~/maestro-bridge/tasks/.

Per ogni request:
  - Crea (se non esiste già) un file iris-dev-{timestamp}-{shortid}.md
    con il prompt in linguaggio naturale + contesto email se disponibile.
  - Marca la request come "in_progress" in Firestore (richiede Admin SDK,
    quindi i client web non possono interferire).
  - Skip silenzioso se il file task per quella request esiste già.

Idempotente. Non cancella mai file. Non riapre richieste già processate.

Usage:
  python3 scripts/export_dev_requests.py            # esporta tutte le pending
  python3 scripts/export_dev_requests.py --dry-run  # mostra cosa farebbe senza scrivere
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

PROJECT_DIR = Path(__file__).resolve().parent.parent  # projects/iris
REPO_ROOT = PROJECT_DIR.parent.parent                  # ~/maestro-bridge
TASKS_DIR = REPO_ROOT / "tasks"
ENV_PATH = PROJECT_DIR / ".env"
COLLECTION = "nexo_dev_requests"


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def slugify(s: str, max_len: int = 40) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:max_len] or "request"


def task_filename(request_id: str, created_at: datetime | None, request_text: str) -> str:
    ts = created_at or datetime.now(timezone.utc)
    short_id = request_id[:8]
    slug = slugify(request_text.split("\n")[0])
    return f"iris-dev-{ts.strftime('%Y%m%d-%H%M%S')}-{short_id}-{slug}.md"


def render_task_md(request_id: str, data: dict, created_at: datetime | None) -> str:
    text = (data.get("request") or "").strip()
    email_id = data.get("emailId")
    email_subj = data.get("emailSubject")
    email_sender = data.get("emailSender")
    email_cat = data.get("emailCategory")
    apply_to_cat = bool(data.get("applyToCategory"))
    ts = (created_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d %H:%M UTC")

    lines = []
    lines.append(f"<!-- IRIS dev request: {request_id} -->")
    lines.append(f"<!-- Inviata: {ts} · status iniziale: pending → in_progress -->")
    lines.append("")
    lines.append("## Richiesta utente (in-app, dalla PWA IRIS)")
    lines.append("")
    lines.append(text)
    lines.append("")

    if email_id or email_subj or email_sender or email_cat:
        lines.append("## Contesto email che ha generato l'idea")
        lines.append("")
        if email_subj: lines.append(f"- **Oggetto:** {email_subj}")
        if email_sender: lines.append(f"- **Mittente:** {email_sender}")
        if email_cat: lines.append(f"- **Categoria IRIS:** `{email_cat}`")
        if email_id: lines.append(f"- **Email doc id:** `{email_id}`")
        lines.append(f"- **Applica a tutta la categoria:** {'sì' if apply_to_cat else 'no (solo questa email)'}")
        lines.append("")

    lines.append("## Note per chi implementa")
    lines.append("")
    lines.append("Questa richiesta arriva direttamente dall'utente attraverso il bottone")
    lines.append("\"💡 Idea\" della PWA IRIS. È in linguaggio naturale, non strutturata.")
    lines.append("Prima di toccare codice, chiarisci con l'utente:")
    lines.append("- Cosa significa concretamente la richiesta?")
    lines.append("- Quali file/feature di IRIS coinvolge?")
    lines.append("- Va in pipeline (Python), classifier (prompt), PWA, o altro?")
    lines.append("")
    lines.append("Quando hai completato, aggiorna lo status della request in Firestore:")
    lines.append(f"```bash")
    lines.append(f"# Da projects/iris/")
    lines.append(f"python3 -c \"")
    lines.append(f"import firebase_admin")
    lines.append(f"from firebase_admin import firestore")
    lines.append(f"firebase_admin.initialize_app(options={{'projectId':'nexo-hub-15f2d'}})")
    lines.append(f"firestore.client().collection('{COLLECTION}').document('{request_id}').update({{'status':'completed'}})")
    lines.append(f"\"")
    lines.append(f"```")
    return "\n".join(lines) + "\n"


def main() -> int:
    load_env()
    dry_run = "--dry-run" in sys.argv

    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")
    print(f"[export] project={project_id}  tasks_dir={TASKS_DIR}", flush=True)

    if not TASKS_DIR.exists():
        print(f"     ! tasks dir non esiste: {TASKS_DIR}", file=sys.stderr)
        return 2

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    db = firestore.client()

    # Index esistente: file iris-dev-*-{shortid}-* presenti, per evitare duplicati.
    existing_short_ids = set()
    for p in TASKS_DIR.glob("iris-dev-*"):
        m = re.search(r"iris-dev-\d{8}-\d{6}-([a-zA-Z0-9]{1,12})-", p.name)
        if m:
            existing_short_ids.add(m.group(1))
    print(f"[export] {len(existing_short_ids)} task IRIS-dev già su disco.", flush=True)

    snaps = list(
        db.collection(COLLECTION)
        .where(filter=FieldFilter("status", "==", "pending"))
        .stream()
    )
    print(f"[export] {len(snaps)} request pending da processare.\n", flush=True)
    if not snaps:
        print("Nulla da esportare.")
        return 0

    written = 0
    skipped = 0
    for snap in snaps:
        rid = snap.id
        data = snap.to_dict() or {}
        created_at = None
        if data.get("createdAt"):
            try:
                created_at = data["createdAt"]
                # firestore.SERVER_TIMESTAMP returns DatetimeWithNanoseconds
                if hasattr(created_at, "tzinfo") and created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
            except Exception:
                created_at = None

        short = rid[:8]
        if short in existing_short_ids:
            skipped += 1
            print(f"  · skip (file esistente) {rid[:12]}", flush=True)
            continue

        fname = task_filename(rid, created_at, data.get("request") or "")
        target = TASKS_DIR / fname

        body = render_task_md(rid, data, created_at)
        if dry_run:
            print(f"  → would write {target.name} ({len(body)} bytes)", flush=True)
        else:
            target.write_text(body, encoding="utf-8")
            db.collection(COLLECTION).document(rid).update({
                "status": "in_progress",
                "exportedAt": firestore.SERVER_TIMESTAMP,
                "taskFile": fname,
            })
            print(f"  ✓ {fname}", flush=True)
        written += 1

    print()
    print("=" * 60)
    if dry_run:
        print(f"DRY-RUN: avrei esportato {written}, skippato {skipped}.")
    else:
        print(f"Esportate {written} request, skippate {skipped}. Status → in_progress.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
