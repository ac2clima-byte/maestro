#!/usr/bin/env python3
"""
iris_hetzner_poller.py — poller EWS standalone per IRIS.

Gira su Hetzner (178.104.88.86) via cron ogni 5 minuti. Bypass del
problema "EWS on-prem non raggiungibile da GCP europe-west1".

Pipeline:
  1. Legge config da .env (EWS_URL, EWS_USERNAME, EWS_PASSWORD,
     ANTHROPIC_API_KEY, FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS)
  2. Legge watermark da Firestore nexo-hub-15f2d/iris_poller_state/default
  3. Fetch email EWS da inbox dopo watermark (limit 50)
  4. Per ogni email: classifica con Claude Haiku
  5. Scrive doc in iris_emails (dedup via hash message_id)
  6. Aggiorna watermark al timestamp della più recente
  7. Logga summary su stdout (catturato da cron → /var/log/iris_poller.log)

Idempotente, safe per rerun.
"""
import os
import sys
import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv("/opt/nexo/.env")
except ImportError:
    pass  # dotenv opzionale: le env possono venire dal cron/systemd

try:
    from exchangelib import (
        Account, Credentials, Configuration, DELEGATE, EWSDateTime,
    )
    from exchangelib.folders import Inbox
except ImportError:
    print("ERR: pip install exchangelib", file=sys.stderr)
    sys.exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials as fb_credentials, firestore
except ImportError:
    print("ERR: pip install firebase-admin", file=sys.stderr)
    sys.exit(1)

try:
    from anthropic import Anthropic
except ImportError:
    print("ERR: pip install anthropic", file=sys.stderr)
    sys.exit(1)


# ─── Config ────────────────────────────────────────────────────
EWS_URL = os.environ.get("EWS_URL", "").strip()
EWS_USERNAME = os.environ.get("EWS_USERNAME", "").strip()
EWS_PASSWORD = os.environ.get("EWS_PASSWORD", "").strip()
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")
FB_CREDENTIALS_JSON = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    "/opt/nexo/firebase-service-account.json",
)

LIMIT_PER_RUN = int(os.environ.get("EWS_LIMIT_PER_RUN", "50"))
INITIAL_LOOKBACK_HOURS = int(os.environ.get("EWS_INITIAL_HOURS", "24"))

WATERMARK_COLL = "iris_poller_state"
WATERMARK_DOC = "default"
EMAILS_COLL = "iris_emails"

CLASSIFY_MODEL = "claude-haiku-4-5"

CLASSIFY_SYSTEM = """Sei l'assistente di classificazione email per ACG Clima Service (manutenzione HVAC).
Classifica l'email in UNA categoria tra:
- GUASTO_URGENTE
- PEC_UFFICIALE
- RICHIESTA_INTERVENTO
- RICHIESTA_CONTRATTO
- RICHIESTA_PAGAMENTO
- FATTURA_FORNITORE
- COMUNICAZIONE_INTERNA
- NEWSLETTER_SPAM
- ALTRO

Rispondi SOLO con JSON stretto:
{
  "category": "<SLUG>",
  "summary": "<1 frase>",
  "sentiment": "positivo|neutro|negativo|urgente",
  "suggestedAction": "<verbo_azione>",
  "entities": { "cliente": "...", "condominio": "...", "indirizzo": "...", "targa": "..." }
}
Niente code fence, niente testo extra."""


# ─── Logging (stdout → cron log) ───────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("iris_hetzner_poller")


def validate_config():
    missing = []
    if not EWS_URL: missing.append("EWS_URL")
    if not EWS_USERNAME: missing.append("EWS_USERNAME")
    if not EWS_PASSWORD: missing.append("EWS_PASSWORD")
    if not ANTHROPIC_API_KEY: missing.append("ANTHROPIC_API_KEY")
    if missing:
        log.error(f"Missing config: {missing}")
        sys.exit(2)
    if not os.path.exists(FB_CREDENTIALS_JSON):
        log.error(f"Firebase service account non trovato: {FB_CREDENTIALS_JSON}")
        sys.exit(3)


# ─── Firestore ─────────────────────────────────────────────────
def get_firestore():
    try:
        firebase_admin.get_app()
    except ValueError:
        cred = fb_credentials.Certificate(FB_CREDENTIALS_JSON)
        firebase_admin.initialize_app(cred, {"projectId": FIREBASE_PROJECT_ID})
    return firestore.client()


# ─── EWS ────────────────────────────────────────────────────────
def get_ews_account():
    creds = Credentials(username=EWS_USERNAME, password=EWS_PASSWORD)
    config = Configuration(service_endpoint=EWS_URL, credentials=creds)
    account = Account(
        primary_smtp_address=EWS_USERNAME,
        config=config,
        autodiscover=False,
        access_type=DELEGATE,
    )
    return account


def fetch_new_emails(account, since_dt: datetime, limit: int):
    """Ritorna lista di dict con le email ricevute dopo since_dt, ordinate asc."""
    # exchangelib vuole EWSDateTime
    since_ews = EWSDateTime.from_datetime(since_dt.astimezone(timezone.utc))
    qs = (
        account.inbox.filter(datetime_received__gt=since_ews)
        .order_by("datetime_received")
        .only(
            "message_id",
            "datetime_received",
            "sender",
            "subject",
            "text_body",
            "body",
            "importance",
            "is_read",
        )[:limit]
    )
    out = []
    for item in qs:
        try:
            body_text = (item.text_body or "")[:8000]
            if not body_text and item.body:
                # fallback: rimuovi HTML rudimentale
                import re
                body_text = re.sub(r"<[^>]+>", " ", str(item.body))[:8000]
            sender_email = ""
            sender_name = ""
            if item.sender:
                sender_email = (getattr(item.sender, "email_address", "") or "").strip()
                sender_name = (getattr(item.sender, "name", "") or "").strip()
            out.append({
                "message_id": item.message_id or f"noid-{item.datetime_received.isoformat()}",
                "received_time": item.datetime_received.isoformat(),
                "sender": sender_email,
                "sender_name": sender_name,
                "subject": (item.subject or "").strip(),
                "body_text": body_text,
                "importance": str(item.importance or ""),
                "is_read": bool(item.is_read),
            })
        except Exception as e:
            log.warning(f"skip item: {e}")
    return out


# ─── Claude Haiku classify ─────────────────────────────────────
def classify_email(client: Anthropic, email: dict) -> dict:
    user = "\n".join([
        f"Da: {email['sender_name']} <{email['sender']}>" if email["sender_name"] else f"Da: {email['sender']}",
        f"Oggetto: {email['subject'] or '(nessun oggetto)'}",
        "",
        "Corpo:",
        (email["body_text"] or "")[:3000],
    ])
    try:
        resp = client.messages.create(
            model=CLASSIFY_MODEL,
            max_tokens=400,
            system=CLASSIFY_SYSTEM,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError(f"No JSON in response: {text[:200]}")
        parsed = json.loads(text[start:end + 1])
        return {
            "category": parsed.get("category") or "ALTRO",
            "summary": parsed.get("summary") or "",
            "sentiment": parsed.get("sentiment") or "neutro",
            "suggestedAction": parsed.get("suggestedAction") or "",
            "entities": parsed.get("entities") or {},
        }
    except Exception as e:
        log.warning(f"classify failed: {e}")
        return {"category": "ALTRO", "summary": "", "sentiment": "neutro", "suggestedAction": "", "entities": {}}


# ─── Main ──────────────────────────────────────────────────────
def hash_msgid(msgid: str) -> str:
    """ID deterministico per doc Firestore (IMAP ID può contenere caratteri non ammessi)."""
    h = hashlib.sha1(msgid.encode("utf-8")).hexdigest()[:16]
    return f"ews_{h}"


def main():
    validate_config()
    db = get_firestore()
    watermark_ref = db.collection(WATERMARK_COLL).document(WATERMARK_DOC)

    # Watermark
    snap = watermark_ref.get()
    last_iso = snap.to_dict().get("lastProcessedIso") if snap.exists else None
    if last_iso:
        try:
            since = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
        except Exception:
            since = datetime.now(timezone.utc) - timedelta(hours=INITIAL_LOOKBACK_HOURS)
    else:
        since = datetime.now(timezone.utc) - timedelta(hours=INITIAL_LOOKBACK_HOURS)
        log.info(f"First run: lookback {INITIAL_LOOKBACK_HOURS}h → {since.isoformat()}")

    # EWS fetch
    log.info(f"Fetching emails since {since.isoformat()}")
    try:
        account = get_ews_account()
    except Exception as e:
        log.error(f"EWS connect failed: {e}")
        sys.exit(10)

    try:
        emails = fetch_new_emails(account, since, LIMIT_PER_RUN)
    except Exception as e:
        log.error(f"EWS fetch failed: {e}")
        sys.exit(11)

    if not emails:
        log.info("No new emails.")
        watermark_ref.set({"lastRunAt": firestore.SERVER_TIMESTAMP}, merge=True)
        return

    log.info(f"Got {len(emails)} emails to process.")

    # Classifica + scrivi
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    processed = 0
    skipped = 0
    errors = 0
    latest_iso = since.isoformat()

    for email in emails:
        doc_id = hash_msgid(email["message_id"])
        existing = db.collection(EMAILS_COLL).document(doc_id).get()
        if existing.exists:
            skipped += 1
            continue

        classification = classify_email(client, email)

        try:
            db.collection(EMAILS_COLL).document(doc_id).set({
                "id": doc_id,
                "raw": email,
                "classification": classification,
                "source": "iris_hetzner_poller",
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
            processed += 1
        except Exception as e:
            errors += 1
            log.error(f"Firestore write failed for {doc_id}: {e}")

        if email["received_time"] > latest_iso:
            latest_iso = email["received_time"]

    # Aggiorna watermark
    watermark_ref.set({
        "lastProcessedIso": latest_iso,
        "lastRunAt": firestore.SERVER_TIMESTAMP,
        "lastRunProcessed": processed,
        "lastRunSkipped": skipped,
        "lastRunErrors": errors,
        "source": "hetzner",
    }, merge=True)

    log.info(
        f"DONE processed={processed} skipped={skipped} errors={errors} "
        f"latest={latest_iso}"
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        log.exception(f"Unhandled: {e}")
        sys.exit(1)
