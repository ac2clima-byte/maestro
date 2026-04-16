#!/usr/bin/env python3
"""
Read-only test: fetch the last N emails from Alberto's inbox via EWS.

Does NOT modify, mark-as-read, delete, or reply to anything. Only reads.

Usage: python3 read_last_emails.py [N]  (default N=3)
"""
from __future__ import annotations

import json
import os
import sys
import urllib3
from pathlib import Path

from exchangelib import Account, Configuration, Credentials, DELEGATE
from exchangelib.protocol import BaseProtocol, NoVerifyHTTPAdapter


BaseProtocol.HTTP_ADAPTER_CLS = NoVerifyHTTPAdapter
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def load_env() -> None:
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def clip(text: str | None, limit: int = 1500) -> str:
    if not text:
        return ""
    return text[:limit]


def main() -> int:
    load_env()
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3

    url = os.environ["EWS_URL"]
    username = os.environ["EWS_USERNAME"]
    password = os.environ["EWS_PASSWORD"]
    domain = os.environ.get("EWS_DOMAIN", "")

    principal = f"{domain}\\{username}" if domain else username
    credentials = Credentials(username=principal, password=password)
    config = Configuration(service_endpoint=url, credentials=credentials)

    account = Account(
        primary_smtp_address=username,
        config=config,
        autodiscover=False,
        access_type=DELEGATE,
    )

    # READ-ONLY: .order_by + slice does not mark-as-read.
    items = list(account.inbox.all().order_by("-datetime_received")[:n])

    out = []
    for item in items:
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
            "is_read": bool(item.is_read),
        })

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
