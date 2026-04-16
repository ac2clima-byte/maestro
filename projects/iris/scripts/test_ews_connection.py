#!/usr/bin/env python3
"""
Test di connessione EWS read-only.

- Si connette a https://remote.gruppobadano.it/ews/exchange.asmx via NTLM.
- Disabilita la verifica TLS (certificato self-signed).
- Legge le ultime 5 email dalla Inbox.
- Stampa mittente/oggetto/data/body[:200] a console e in un file Markdown.

NON modifica, segna come letta, cancella, risponde o inoltra alcuna email.
Usa `.all().order_by('-datetime_received')[:5]`, che è una query di sola lettura.
"""
from __future__ import annotations

import os
import sys
import urllib3
from datetime import datetime, timezone
from pathlib import Path

from exchangelib import Account, Configuration, Credentials, DELEGATE
from exchangelib.protocol import BaseProtocol, NoVerifyHTTPAdapter


# --- TLS self-signed: disabilita la verifica (pinning futuro) ---
BaseProtocol.HTTP_ADAPTER_CLS = NoVerifyHTTPAdapter
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


EWS_URL = "https://remote.gruppobadano.it/ews/exchange.asmx"
HERMES_ENV = Path("/mnt/c/HERMES/.env")
OUTPUT_MD = Path(__file__).resolve().parents[1] / "test-ews-output.md"
N_EMAILS = 5


def load_credentials() -> tuple[str, str]:
    """Leggi OUTLOOK_USER / OUTLOOK_PASSWORD da /mnt/c/HERMES/.env."""
    user = password = None
    for line in HERMES_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if k == "OUTLOOK_USER":
            user = v
        elif k == "OUTLOOK_PASSWORD":
            password = v
    if not user or not password:
        raise RuntimeError(
            f"OUTLOOK_USER / OUTLOOK_PASSWORD mancanti in {HERMES_ENV}"
        )
    return user, password


def clip(text: str | None, limit: int = 200) -> str:
    if not text:
        return "(corpo vuoto)"
    flattened = " ".join(text.split())
    return (flattened[:limit] + "…") if len(flattened) > limit else flattened


def format_dt(dt) -> str:
    if dt is None:
        return "(data non disponibile)"
    try:
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        return str(dt)


def main() -> int:
    user, password = load_credentials()
    print(f"[EWS] connecting to {EWS_URL} as {user} …", flush=True)

    credentials = Credentials(username=user, password=password)
    config = Configuration(service_endpoint=EWS_URL, credentials=credentials)
    account = Account(
        primary_smtp_address=user,
        config=config,
        autodiscover=False,
        access_type=DELEGATE,
    )

    # READ-ONLY query.
    items = list(
        account.inbox.all().order_by("-datetime_received")[:N_EMAILS]
    )
    print(f"[EWS] OK, received {len(items)} message(s).\n", flush=True)

    md_lines: list[str] = []
    md_lines.append("# IRIS — Test connessione EWS reale\n")
    md_lines.append(
        f"**Data esecuzione**: "
        f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
    )
    md_lines.append(f"**Server**: `{EWS_URL}`")
    md_lines.append(f"**Account**: `{user}`")
    md_lines.append(f"**TLS**: `NoVerifyHTTPAdapter` (self-signed accettato)")
    md_lines.append(
        "**Query**: `account.inbox.all().order_by('-datetime_received')[:5]` — read-only\n"
    )
    md_lines.append(f"**Esito**: ✅ {len(items)} email lette, nessuna modifica effettuata.\n")
    md_lines.append("---\n")

    for i, item in enumerate(items, start=1):
        sender = (
            f"{item.sender.name} <{item.sender.email_address}>"
            if item.sender and item.sender.email_address
            else (item.sender.email_address if item.sender else "(sconosciuto)")
        )
        subject = item.subject or "(nessun oggetto)"
        received = format_dt(item.datetime_received)
        body_preview = clip(item.text_body, 200)
        has_att = "sì" if item.has_attachments else "no"
        importance = str(item.importance) if item.importance else "Normal"

        # Console output
        print(f"--- Email #{i} ---")
        print(f"  Mittente : {sender}")
        print(f"  Oggetto  : {subject}")
        print(f"  Ricevuta : {received}")
        print(f"  Allegati : {has_att}    Importanza: {importance}")
        print(f"  Body     : {body_preview}")
        print()

        # Markdown output
        md_lines.append(f"## Email #{i}\n")
        md_lines.append(f"- **Mittente**: `{sender}`")
        md_lines.append(f"- **Oggetto**: {subject}")
        md_lines.append(f"- **Ricevuta**: {received}")
        md_lines.append(f"- **Allegati**: {has_att}")
        md_lines.append(f"- **Importanza**: {importance}")
        md_lines.append("")
        md_lines.append("**Anteprima corpo (primi 200 caratteri):**")
        md_lines.append("")
        md_lines.append("> " + body_preview.replace("\n", " "))
        md_lines.append("")
        md_lines.append("---\n")

    OUTPUT_MD.write_text("\n".join(md_lines), encoding="utf-8")
    print(f"[output] Report salvato in {OUTPUT_MD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
