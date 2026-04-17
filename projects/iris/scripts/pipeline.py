#!/usr/bin/env python3
"""
IRIS pipeline: EWS → Classifier (Haiku) → Firestore.

Reads the last N unread/recent emails from the Exchange inbox, classifies each
one with Claude Haiku using prompts/classifier.md, and writes a document per
email to Firestore collection `iris_emails` (project: nexo-hub-15f2d).

Read-only on EWS (`.all().order_by('-datetime_received')[:N]`) — no flags
modified, no replies, no deletions. Idempotent on Firestore (document id is
the Exchange message_id, so re-runs UPDATE the same doc).

Usage: python3 pipeline.py [N]  (default N=30)
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
import urllib3
from datetime import datetime, timezone
from pathlib import Path

from exchangelib import Account, Configuration, Credentials, DELEGATE
from exchangelib.protocol import BaseProtocol, NoVerifyHTTPAdapter

import firebase_admin
from firebase_admin import credentials as fb_credentials, firestore

# Local module: ThreadDetector (Python port of src/threads/ThreadDetector.ts)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from thread_detector import ThreadDetector  # noqa: E402


# --- TLS: self-signed EWS cert accepted for now (pinning TODO) ---
BaseProtocol.HTTP_ADAPTER_CLS = NoVerifyHTTPAdapter
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


PROJECT_DIR = Path(__file__).resolve().parents[1]
PROMPT_PATH = PROJECT_DIR / "prompts" / "classifier.md"
ENV_PATH = PROJECT_DIR / ".env"
MODEL = os.environ.get("IRIS_MODEL", "claude-haiku-4-5")
API_URL = "https://api.anthropic.com/v1/messages"
COLLECTION = "iris_emails"
THREADS_COLLECTION = "iris_threads"
USER_ID = "alberto"

VALID_CATEGORIES = {
    "RICHIESTA_INTERVENTO", "GUASTO_URGENTE", "PREVENTIVO",
    "CONFERMA_APPUNTAMENTO", "FATTURA_FORNITORE", "COMUNICAZIONE_INTERNA",
    "PEC_UFFICIALE", "AMMINISTRATORE_CONDOMINIO", "RISPOSTA_CLIENTE",
    "NEWSLETTER_SPAM", "ALTRO",
}
VALID_ACTIONS = {
    "RISPONDI", "APRI_INTERVENTO", "INOLTRA", "ARCHIVIA",
    "PREPARA_PREVENTIVO", "VERIFICA_PAGAMENTO", "URGENTE_CHIAMA",
}
VALID_SENTIMENTS = {
    "positivo", "neutro", "frustrato", "arrabbiato", "disperato",
}


def load_env() -> None:
    if not ENV_PATH.exists():
        raise RuntimeError(f"Missing {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def clip(text: str | None, limit: int = 2000) -> str:
    return (text or "")[:limit]


def fetch_emails(n: int) -> list[dict]:
    url = os.environ["EWS_URL"]
    user = os.environ["EWS_USERNAME"]
    password = os.environ["EWS_PASSWORD"]
    domain = os.environ.get("EWS_DOMAIN", "")
    principal = f"{domain}\\{user}" if domain else user

    creds = Credentials(username=principal, password=password)
    config = Configuration(service_endpoint=url, credentials=creds)
    account = Account(
        primary_smtp_address=user,
        config=config,
        autodiscover=False,
        access_type=DELEGATE,
    )
    items = list(account.inbox.all().order_by("-datetime_received")[:n])

    out = []
    for item in items:
        # Reference headers (read-only). exchangelib exposes these as fields.
        in_reply_to = getattr(item, "in_reply_to", None)
        refs_field = getattr(item, "references", None)
        if isinstance(refs_field, str):
            refs = [r.strip() for r in refs_field.split() if r.strip()]
        elif isinstance(refs_field, (list, tuple)):
            refs = [str(r).strip() for r in refs_field if r]
        else:
            refs = []
        # to recipients (only addresses)
        to_recipients = []
        try:
            for r in (item.to_recipients or []):
                addr = getattr(r, "email_address", None)
                if addr:
                    to_recipients.append(addr)
        except Exception:
            pass
        out.append({
            "message_id": item.message_id or str(item.id),
            "subject": item.subject or "",
            "sender": item.sender.email_address if item.sender else "",
            "sender_name": item.sender.name if item.sender else "",
            "received_time": (
                item.datetime_received.isoformat()
                if item.datetime_received else None
            ),
            "body_text": clip(item.text_body or ""),
            "has_attachments": bool(item.has_attachments),
            "importance": str(item.importance) if item.importance else "Normal",
            "in_reply_to": in_reply_to or None,
            "references": refs,
            "to_recipients": to_recipients,
        })
    return out


def build_user_prompt(email: dict) -> str:
    flags = []
    if email.get("has_attachments"):
        flags.append("con allegati")
    if email.get("importance") and email["importance"] != "Normal":
        flags.append(f"importanza: {email['importance']}")
    flags_line = f"Flag: {', '.join(flags)}\n" if flags else ""
    return "\n".join([
        "Classifica la seguente email.",
        "",
        f"Mittente: {email.get('sender') or '(sconosciuto)'}",
        f"Ricevuta: {email.get('received_time') or '(data non disponibile)'}",
        f"Oggetto: {email.get('subject') or '(nessun oggetto)'}",
        flags_line,
        "--- CORPO EMAIL ---",
        email.get("body_text") or "(corpo vuoto)",
        "--- FINE CORPO ---",
        "",
        "Rispondi ESCLUSIVAMENTE con l'oggetto JSON previsto dallo schema.",
    ])


def extract_json(text: str) -> str | None:
    text = (text or "").strip()
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    candidate = fence.group(1).strip() if fence else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return candidate[start:end + 1]


def validate_classification(obj: dict) -> dict:
    cat = obj.get("category")
    act = obj.get("suggestedAction")
    conf = obj.get("confidence")
    if cat not in VALID_CATEGORIES:
        obj["category"] = "ALTRO"
    if act not in VALID_ACTIONS:
        obj["suggestedAction"] = "ARCHIVIA"
    if conf not in ("high", "medium", "low"):
        obj["confidence"] = "low"
    # Normalize entities: keep only strings in the 7 allowed keys.
    allowed = {"cliente", "condominio", "impianto", "urgenza",
               "importo", "tecnico", "indirizzo"}
    ent = obj.get("entities") or {}
    obj["entities"] = {
        k: v.strip() for k, v in ent.items()
        if k in allowed and isinstance(v, str) and v.strip()
    }
    obj.setdefault("summary", "")
    obj.setdefault("reasoning", "")
    sentiment = obj.get("sentiment")
    if sentiment not in VALID_SENTIMENTS:
        obj["sentiment"] = "neutro"
    obj.setdefault("sentimentReason", "")
    return obj


def classify(email: dict, system_prompt: str, api_key: str) -> tuple[dict, dict]:
    payload = {
        "model": MODEL,
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [{"role": "user", "content": build_user_prompt(email)}],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp_json = json.loads(resp.read().decode("utf-8"))

    text = "\n".join(
        b["text"] for b in resp_json.get("content", []) if b.get("type") == "text"
    ).strip()
    json_str = extract_json(text)
    if not json_str:
        raise RuntimeError(f"No JSON in model response: {text[:200]}")
    classification = validate_classification(json.loads(json_str))
    usage = resp_json.get("usage", {})
    return classification, usage


def doc_id_for(message_id: str) -> str:
    # Firestore doc id: safe, deterministic, max 1500 bytes.
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", message_id).strip("_")
    return safe[:150] or "unknown"


def init_firestore(project_id: str):
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": project_id})
    return firestore.client()


def write_email_doc(db, email: dict, classification: dict) -> str:
    doc_id = doc_id_for(email["message_id"])
    now = firestore.SERVER_TIMESTAMP
    data = {
        "id": email["message_id"],
        "userId": USER_ID,
        "raw": {
            "subject": email["subject"],
            "sender": email["sender"],
            "sender_name": email.get("sender_name", ""),
            "body_text": email["body_text"],
            "received_time": email["received_time"],
            "has_attachments": email["has_attachments"],
            "importance": email["importance"],
            "in_reply_to": email.get("in_reply_to"),
            "references": email.get("references") or [],
            "to_recipients": email.get("to_recipients") or [],
        },
        "classification": classification,
        "status": "classified",
        "updatedAt": now,
    }
    ref = db.collection(COLLECTION).document(doc_id)
    # Preserve createdAt on re-runs.
    snap = ref.get()
    if not snap.exists:
        data["createdAt"] = now
    ref.set(data, merge=True)
    return doc_id


def write_thread_doc(db, thread: dict) -> str:
    """Idempotent: thread doc id is deterministic from subject+participants."""
    doc_id = thread["id"]
    now = firestore.SERVER_TIMESTAMP
    # Map email message_ids → Firestore doc ids (so the PWA can join).
    email_doc_ids = [doc_id_for(mid) for mid in thread["emailIds"]]
    data = {
        "id": doc_id,
        "userId": USER_ID,
        "normalizedSubject": thread["normalizedSubject"],
        "emailIds": thread["emailIds"],
        "emailDocIds": email_doc_ids,
        "participants": thread["participants"],
        "messageCount": thread["messageCount"],
        "firstMessageAt": thread["firstMessageAt"],
        "lastMessageAt": thread["lastMessageAt"],
        "sentiment_evolution": thread["sentiment_evolution"],
        "updatedAt": now,
    }
    ref = db.collection(THREADS_COLLECTION).document(doc_id)
    snap = ref.get()
    if not snap.exists:
        data["createdAt"] = now
    ref.set(data, merge=True)
    return doc_id


def main() -> int:
    load_env()
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30

    api_key = os.environ["ANTHROPIC_API_KEY"]
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")

    print(f"[pipeline] project={project_id} model={MODEL} n={n}\n", flush=True)

    print("[step 1/3] Fetching emails from EWS…", flush=True)
    emails = fetch_emails(n)
    print(f"           OK, {len(emails)} emails.\n", flush=True)

    print("[step 2/3] Classifying with Haiku…", flush=True)
    results = []
    for i, em in enumerate(emails, 1):
        try:
            cls, usage = classify(em, system_prompt, api_key)
            results.append({"email": em, "classification": cls, "usage": usage})
            print(
                f"  #{i}  {cls['category']:<28}  {cls['confidence']:<6}  "
                f"{cls.get('sentiment','neutro'):<11}  "
                f"{em['sender'][:40]:<40}  → {cls['suggestedAction']}",
                flush=True,
            )
        except Exception as e:
            print(f"  #{i}  FAILED: {e}", flush=True)
    print()

    print("[step 3/4] Writing emails to Firestore…", flush=True)
    db = init_firestore(project_id)
    written = []
    for r in results:
        doc_id = write_email_doc(db, r["email"], r["classification"])
        written.append(doc_id)
        print(f"           ✓ iris_emails/{doc_id}", flush=True)
    print()

    print("[step 4/4] Detecting threads + writing to Firestore…", flush=True)
    detector_input = [
        {"email": r["email"], "classification": r["classification"]} for r in results
    ]
    threads = ThreadDetector().detect(detector_input)
    thread_ids = []
    for t in threads:
        tid = write_thread_doc(db, t)
        thread_ids.append(tid)
        # short summary line
        evo = "→".join(t["sentiment_evolution"]) if t["sentiment_evolution"] else "—"
        print(
            f"           ✓ iris_threads/{tid[:60]:<60}  "
            f"msgs={t['messageCount']:<2} sent={evo}",
            flush=True,
        )
    print()

    total_input = sum(r["usage"].get("input_tokens", 0) for r in results)
    total_output = sum(r["usage"].get("output_tokens", 0) for r in results)
    multi_msg_threads = sum(1 for t in threads if t["messageCount"] > 1)
    print("=" * 60)
    print(f"Summary: {len(emails)} read, {len(results)} classified, {len(written)} email docs, {len(thread_ids)} threads ({multi_msg_threads} multi-msg).")
    print(f"Tokens:  input={total_input}  output={total_output}")
    print(f"Console: https://console.firebase.google.com/project/{project_id}/firestore")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
