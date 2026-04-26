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
from firebase_admin import credentials as fb_credentials, firestore, storage as fb_storage
import hashlib as _hashlib
import uuid as _uuid

# Local modules.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from thread_detector import ThreadDetector  # noqa: E402
from followup_detector import FollowupDetector  # noqa: E402
from attachment_tagger import (  # noqa: E402
    detect_type as tag_attachment_type,
    extract_amount as tag_extract_amount,
    extract_pdf_text as tag_extract_pdf_text,
)
from score_calculator import compute_score  # noqa: E402
from rule_engine import RuleEngine  # noqa: E402


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
RULES_COLLECTION = "iris_rules"
LAVAGNA_COLLECTION = "nexo_lavagna"
ECHO_NOTIF_COLLECTION = "echo_notifications"  # consumed by ECHO when ready
USER_ID = "alberto"

# Limite dimensione PDF da scaricare per estrarre testo (2MB).
MAX_PDF_BYTES = 2_000_000
# Max byte salvati in Firebase Storage (per il bottone "Apri" nella PWA).
# 10MB copre PDF normali, screenshot, documenti scansionati. Allegati più
# grandi vengono lasciati nell'inbox EWS; mostriamo solo metadata.
MAX_STORAGE_BYTES = 10_000_000
# Lunghezza max testo estratto persistito su Firestore.
MAX_EXTRACTED_TEXT = 600

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


def _make_account():
    url = os.environ["EWS_URL"]
    user = os.environ["EWS_USERNAME"]
    password = os.environ["EWS_PASSWORD"]
    domain = os.environ.get("EWS_DOMAIN", "")
    principal = f"{domain}\\{user}" if domain else user

    creds = Credentials(username=principal, password=password)
    config = Configuration(service_endpoint=url, credentials=creds)
    return Account(
        primary_smtp_address=user,
        config=config,
        autodiscover=False,
        access_type=DELEGATE,
    )


_BUCKET_CACHE = {"bucket": None}

def _get_storage_bucket():
    """
    Restituisce il bucket Firebase Storage default. Cachato per riusi nel
    ciclo di processing email. Se Firebase Admin non è ancora inizializzato
    o il bucket di default non è accessibile, ritorna None (e _save_attachment_to_storage
    fa graceful skip).
    """
    if _BUCKET_CACHE["bucket"] is not None:
        return _BUCKET_CACHE["bucket"] or None
    try:
        # Firebase Admin si aspetta che initialize_app() sia stato chiamato con
        # storageBucket settato. Se manca, fb_storage.bucket() solleva.
        b = fb_storage.bucket("nexo-hub-15f2d.firebasestorage.app")
        _BUCKET_CACHE["bucket"] = b
        return b
    except Exception:
        try:
            # Fallback: bucket default del progetto
            b = fb_storage.bucket()
            _BUCKET_CACHE["bucket"] = b
            return b
        except Exception:
            _BUCKET_CACHE["bucket"] = False
            return None

def _save_attachment_to_storage(
    raw_content: bytes,
    filename: str,
    mime: str,
    email_id: str,
) -> dict:
    """
    Carica il binario allegato in iris_attachments/{email_id}/{filename} di
    Firebase Storage e ritorna {storagePath, downloadUrl}. Genera un download
    token UUID v4 per URL pubblici (pattern firebase storage standard).
    Ritorna dict vuoto in caso di errore (logga ma non interrompe la pipeline).
    """
    if not raw_content or not filename:
        return {}
    if len(raw_content) > MAX_STORAGE_BYTES:
        return {}
    bucket = _get_storage_bucket()
    if not bucket:
        return {}

    # Sanifica filename per il path: rimuovi caratteri non safe per Storage.
    safe_filename = re.sub(r"[^\w\s.\-_()]", "_", filename).strip("._") or "allegato"
    # Path: iris_attachments/{email_doc_id}/{filename_sanificato}
    storage_path = f"iris_attachments/{email_id}/{safe_filename}"
    try:
        blob = bucket.blob(storage_path)
        token = str(_uuid.uuid4())
        blob.metadata = {"firebaseStorageDownloadTokens": token}
        blob.upload_from_string(raw_content, content_type=mime or "application/octet-stream")
        # Costruisci download URL Firebase Storage pubblico
        bucket_name = bucket.name
        encoded_path = storage_path.replace("/", "%2F")
        url = (f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
               f"{encoded_path}?alt=media&token={token}")
        return {
            "storagePath": storage_path,
            "downloadUrl": url,
        }
    except Exception as e:
        logger = globals().get("logger")
        if logger:
            try: logger.warning(f"_save_attachment_to_storage failed: {e}")
            except Exception: pass
        return {}

def _extract_attachments(item, email_doc_id: str = "") -> list[dict]:
    """
    Read-only extraction. Per ogni allegato:
      - filename, mimeType, size sempre.
      - Se PDF e size <= MAX_PDF_BYTES: scarica content, estrai prime righe.
      - Classifica detectedType. Se fattura, prova ad estrarre importo.
      - Se size <= MAX_STORAGE_BYTES e email_doc_id presente: carica il
        binario su Firebase Storage e salva downloadUrl + storagePath
        nell'entry così la PWA può aprirlo cliccando l'icona.

    Salta inline-only (cid embedded) per evitare rumore — manteniamo solo
    quelli con filename utile.
    """
    out = []
    if not item.has_attachments:
        return out
    try:
        atts = list(item.attachments or [])
    except Exception:
        return out

    for a in atts:
        try:
            filename = getattr(a, "name", None) or "(senza nome)"
            mime = getattr(a, "content_type", None)
            size = getattr(a, "size", None)
            is_inline = getattr(a, "is_inline", False)
            if is_inline and not filename:
                continue

            extracted_text = ""
            amount = None
            raw_content = None
            try:
                raw_content = getattr(a, "content", None)
            except Exception:
                raw_content = None

            if (mime or "").lower() == "application/pdf" and (size or 0) <= MAX_PDF_BYTES:
                try:
                    if raw_content:
                        extracted_text = tag_extract_pdf_text(
                            raw_content, max_pages=2, max_chars=1500,
                        )
                except Exception:
                    extracted_text = ""

            detected = tag_attachment_type(filename, mime, extracted_text)
            if detected == "fattura" and extracted_text:
                amount = tag_extract_amount(extracted_text)

            entry = {
                "filename": filename,
                "mimeType": mime or "",
                "size": int(size) if isinstance(size, int) else None,
                "detectedType": detected,
                "isInline": bool(is_inline),
            }
            if extracted_text:
                entry["extractedText"] = extracted_text[:MAX_EXTRACTED_TEXT]
            if amount:
                entry["amount"] = amount

            # Carica binario su Storage per renderlo apribile dalla PWA.
            # Skippa se manca email_doc_id, raw_content, o size oversize.
            if email_doc_id and raw_content and (size or 0) <= MAX_STORAGE_BYTES:
                try:
                    storage_info = _save_attachment_to_storage(
                        raw_content, filename, mime or "", email_doc_id,
                    )
                    if storage_info.get("downloadUrl"):
                        entry["downloadUrl"] = storage_info["downloadUrl"]
                        entry["storagePath"] = storage_info["storagePath"]
                except Exception:
                    pass

            out.append(entry)
        except Exception:
            continue
    return out


def fetch_emails(n: int) -> list[dict]:
    account = _make_account()
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
            "attachments": _extract_attachments(item),
        })
    return out


def fetch_sent(n: int) -> list[dict]:
    """Read-only fetch of last N items from Sent Items, used as 'reply oracle'."""
    account = _make_account()
    items = list(account.sent.all().order_by("-datetime_sent")[:n])
    out = []
    for item in items:
        try:
            recipients = []
            for r in (item.to_recipients or []):
                addr = getattr(r, "email_address", None)
                if addr:
                    recipients.append(addr)
        except Exception:
            recipients = []
        sent_time = None
        try:
            if item.datetime_sent:
                sent_time = item.datetime_sent.isoformat()
        except Exception:
            pass
        out.append({
            "to": recipients,
            "subject": item.subject or "",
            "sent_time": sent_time,
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


_ALLOWED_ENTITY_KEYS = {"cliente", "condominio", "impianto", "urgenza",
                        "importo", "tecnico", "indirizzo"}


def _normalize_entities(ent: dict | None) -> dict:
    ent = ent or {}
    return {
        k: v.strip() for k, v in ent.items()
        if k in _ALLOWED_ENTITY_KEYS and isinstance(v, str) and v.strip()
    }


def _normalize_intents(raw_intents, top_level: dict) -> list[dict]:
    """
    Returns a clean list of {category, summary, suggestedAction, entities}.
    Always at least 1 element (top_level fallback).
    """
    out = []
    if isinstance(raw_intents, list):
        for it in raw_intents:
            if not isinstance(it, dict):
                continue
            cat = it.get("category")
            if cat not in VALID_CATEGORIES:
                continue  # skip intent with invalid category
            act = it.get("suggestedAction")
            if act not in VALID_ACTIONS:
                act = "ARCHIVIA"
            summary = it.get("summary") or ""
            if not isinstance(summary, str):
                summary = str(summary)
            out.append({
                "category": cat,
                "summary": summary[:240],
                "suggestedAction": act,
                "entities": _normalize_entities(it.get("entities")),
            })
    if not out:
        # Fallback: derive single intent from top-level fields.
        out.append({
            "category": top_level.get("category", "ALTRO"),
            "summary": (top_level.get("summary") or "")[:240],
            "suggestedAction": top_level.get("suggestedAction", "ARCHIVIA"),
            "entities": top_level.get("entities") or {},
        })
    return out


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
    obj["entities"] = _normalize_entities(obj.get("entities"))
    obj.setdefault("summary", "")
    obj.setdefault("reasoning", "")
    sentiment = obj.get("sentiment")
    if sentiment not in VALID_SENTIMENTS:
        obj["sentiment"] = "neutro"
    obj.setdefault("sentimentReason", "")
    obj["intents"] = _normalize_intents(obj.get("intents"), obj)
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


def write_email_doc(
    db,
    email: dict,
    classification: dict,
    followup: dict | None = None,
) -> str:
    # Score derivato (idempotente, ricalcolato a ogni run).
    score = compute_score({
        "classification": classification,
        "raw": {
            "has_attachments": email.get("has_attachments"),
        },
        "followup": followup or {},
        "attachments": email.get("attachments") or [],
    })
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
        "attachments": email.get("attachments") or [],
        "classification": classification,
        "score": score,
        "status": "classified",
        "updatedAt": now,
    }
    if followup is not None:
        # Map original message_id → Firestore doc id so the PWA can link.
        original_doc_id = (
            doc_id_for(followup["originalEmailId"])
            if followup.get("originalEmailId")
            else None
        )
        data["followup"] = {
            "isFollowup": bool(followup.get("isFollowup")),
            "originalEmailId": followup.get("originalEmailId"),
            "originalDocId": original_doc_id,
            "daysWithoutReply": int(followup.get("daysWithoutReply") or 0),
            "needsAttention": bool(followup.get("needsAttention")),
        }
    ref = db.collection(COLLECTION).document(doc_id)
    # Preserve createdAt on re-runs.
    snap = ref.get()
    if not snap.exists:
        data["createdAt"] = now
    ref.set(data, merge=True)
    return doc_id


class FirestoreActionRunner:
    """
    Concreto: esegue le azioni del RuleEngine scrivendo su:
      - nexo_lavagna (write_lavagna)
      - echo_notifications (notify_echo) — collection consumata da ECHO
        quando esisterà; per ora è un journal append-only.
      - iris_emails (archive/tag/set_priority/mark_applied)
    """

    def __init__(self, db):
        self.db = db

    def write_lavagna(self, to, message_type, payload, priority, source_email_id):
        ref = self.db.collection(LAVAGNA_COLLECTION).document()
        now = firestore.SERVER_TIMESTAMP
        data = {
            "from": "iris",
            "to": to,
            "type": message_type,
            "priority": priority,
            "status": "pending",
            "payload": payload,
            "sourceEmailId": source_email_id,
            "createdAt": now,
            "updatedAt": now,
        }
        ref.set(data)
        return ref.id

    def notify_echo(self, channel, text, source_email_id):
        ref = self.db.collection(ECHO_NOTIF_COLLECTION).document()
        now = firestore.SERVER_TIMESTAMP
        ref.set({
            "channel": channel,
            "text": text,
            "sourceEmailId": source_email_id,
            "status": "pending",
            "createdAt": now,
        })
        return ref.id

    def archive_email(self, email_id):
        # email_id qui è il message_id originale → mappa al doc id
        doc_id = doc_id_for(email_id)
        self.db.collection(COLLECTION).document(doc_id).set(
            {"status": "archived", "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True,
        )

    def tag_email(self, email_id, tags):
        if not tags:
            return
        doc_id = doc_id_for(email_id)
        self.db.collection(COLLECTION).document(doc_id).set(
            {"tags": firestore.ArrayUnion(list(tags)), "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True,
        )

    def set_priority(self, email_id, priority):
        doc_id = doc_id_for(email_id)
        self.db.collection(COLLECTION).document(doc_id).set(
            {"emailPriority": priority, "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True,
        )

    def mark_rule_applied(self, email_id, rule_id):
        doc_id = doc_id_for(email_id)
        self.db.collection(COLLECTION).document(doc_id).set(
            {
                "appliedRules": firestore.ArrayUnion([rule_id]),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )


def load_rules_from_firestore(db) -> list[dict]:
    snaps = list(db.collection(RULES_COLLECTION).stream())
    return [s.to_dict() | {"id": s.id} for s in snaps]


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

    print("[step 1/6] Fetching inbox emails from EWS…", flush=True)
    emails = fetch_emails(n)
    print(f"           OK, {len(emails)} emails.\n", flush=True)

    print("[step 2/6] Classifying with Haiku…", flush=True)
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

    print("[step 3/6] Fetching Sent Items from EWS (reply oracle)…", flush=True)
    # Sample size 2x inbox so we cover the same time window even if Sent has more traffic.
    sent_n = max(50, n * 3)
    try:
        sent_items = fetch_sent(sent_n)
        print(f"           OK, {len(sent_items)} sent items.\n", flush=True)
    except Exception as e:
        print(f"           WARN: could not fetch Sent Items ({e}). Skipping followup.\n", flush=True)
        sent_items = []

    print("[step 4/6] Computing follow-up / needs-attention…", flush=True)
    incoming_for_fu = [
        {
            "id": r["email"]["message_id"],
            "sender": r["email"]["sender"],
            "subject": r["email"]["subject"],
            "received_time": r["email"]["received_time"],
            "category": r["classification"].get("category"),
            "suggestedAction": r["classification"].get("suggestedAction"),
        }
        for r in results
    ]
    followups = FollowupDetector(attention_after_hours=48).detect(
        incoming_for_fu, sent_items,
    )
    n_followup = sum(1 for v in followups.values() if v["isFollowup"])
    n_attention = sum(1 for v in followups.values() if v["needsAttention"])
    print(f"           {n_followup} follow-up rilevati, {n_attention} email senza risposta (>48h).\n", flush=True)

    print("[step 5/6] Writing emails + threads to Firestore…", flush=True)
    db = init_firestore(project_id)
    written = []
    for r in results:
        fu = followups.get(r["email"]["message_id"])
        doc_id = write_email_doc(db, r["email"], r["classification"], followup=fu)
        written.append(doc_id)
        marker = ""
        if fu:
            if fu["needsAttention"]:
                marker += f" ⏰{fu['daysWithoutReply']}d"
            if fu["isFollowup"]:
                marker += " 🔄"
        print(f"           ✓ iris_emails/{doc_id[:70]:<70}{marker}", flush=True)
    print()

    detector_input = [
        {"email": r["email"], "classification": r["classification"]} for r in results
    ]
    threads = ThreadDetector().detect(detector_input)
    thread_ids = []
    for t in threads:
        tid = write_thread_doc(db, t)
        thread_ids.append(tid)
        evo = "→".join(t["sentiment_evolution"]) if t["sentiment_evolution"] else "—"
        print(
            f"           ✓ iris_threads/{tid[:60]:<60}  "
            f"msgs={t['messageCount']:<2} sent={evo}",
            flush=True,
        )
    print()

    print("[step 6/6] Esecuzione RuleEngine…", flush=True)
    rules_loaded = load_rules_from_firestore(db)
    enabled_count = sum(1 for r in rules_loaded if r.get("enabled"))
    print(f"           {len(rules_loaded)} regole in iris_rules ({enabled_count} attive).", flush=True)
    runner = FirestoreActionRunner(db)
    engine = RuleEngine(runner)
    engine.set_rules(rules_loaded)
    n_matched = 0
    for r in results:
        # Re-fetch del doc (per leggere appliedRules già presente)
        doc_id = doc_id_for(r["email"]["message_id"])
        snap = db.collection(COLLECTION).document(doc_id).get()
        doc_data = snap.to_dict() or {}
        email_for_rules = {
            "id": r["email"]["message_id"],
            "raw": doc_data.get("raw") or {},
            "classification": r["classification"],
            "attachments": doc_data.get("attachments") or [],
            "score": doc_data.get("score"),
            "appliedRules": doc_data.get("appliedRules") or [],
        }
        ev = engine.evaluate(email_for_rules)
        if ev["matchedRule"]:
            n_matched += 1
            out = engine.execute(email_for_rules, ev["matchedRule"], ev.get("extractedData"))
            ok = "✓" if out["ok"] else "✗"
            print(f"           {ok} rule={ev['matchedRule']['id']:<32} "
                  f"actions={len(out['results'])}  email={doc_id[:50]}", flush=True)
    print(f"           {n_matched} email matchate da una regola.\n", flush=True)

    total_input = sum(r["usage"].get("input_tokens", 0) for r in results)
    total_output = sum(r["usage"].get("output_tokens", 0) for r in results)
    multi_msg_threads = sum(1 for t in threads if t["messageCount"] > 1)
    print("=" * 60)
    print(f"Summary: {len(emails)} read, {len(results)} classified, {len(written)} email docs, {len(thread_ids)} threads ({multi_msg_threads} multi-msg).")
    print(f"         Follow-up: {n_followup}   Senza risposta (>48h): {n_attention}   Rules matched: {n_matched}")
    print(f"Tokens:  input={total_input}  output={total_output}")
    print(f"Console: https://console.firebase.google.com/project/{project_id}/firestore")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
