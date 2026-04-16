#!/usr/bin/env python3
"""
EWS poller for IRIS email ingestion.

Connects to an on-premise Exchange server via EWS with NTLM authentication,
fetches unread emails received in the last POLL_INTERVAL_MS window from the
Inbox, and emits each message as a JSON Lines record on stdout.

Env vars:
    EWS_URL, EWS_USERNAME, EWS_PASSWORD, EWS_DOMAIN, POLL_INTERVAL_MS,
    EWS_MAX_RESULTS (default: 30)
"""
from __future__ import annotations

import json
import os
import sys
import urllib3
from datetime import datetime, timedelta, timezone

from exchangelib import (
    Account,
    Configuration,
    Credentials,
    DELEGATE,
    EWSDateTime,
    EWSTimeZone,
)
from exchangelib.protocol import BaseProtocol, NoVerifyHTTPAdapter


# Self-signed cert: accept for now. TODO: cert pinning.
BaseProtocol.HTTP_ADAPTER_CLS = NoVerifyHTTPAdapter
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing required env var: {name}", file=sys.stderr)
        sys.exit(2)
    return value


def _clip(text: str | None, limit: int = 2000) -> str:
    if not text:
        return ""
    return text[:limit]


def main() -> int:
    url = _required_env("EWS_URL")
    username = _required_env("EWS_USERNAME")
    password = _required_env("EWS_PASSWORD")
    domain = os.environ.get("EWS_DOMAIN", "")
    poll_ms = int(os.environ.get("POLL_INTERVAL_MS", "30000"))
    max_results = int(os.environ.get("EWS_MAX_RESULTS", "30"))

    principal = f"{domain}\\{username}" if domain else username
    credentials = Credentials(username=principal, password=password)
    config = Configuration(service_endpoint=url, credentials=credentials)

    account = Account(
        primary_smtp_address=username if "@" in username else f"{username}@local",
        config=config,
        autodiscover=False,
        access_type=DELEGATE,
    )

    tz = EWSTimeZone.localzone()
    cutoff = datetime.now(timezone.utc) - timedelta(milliseconds=poll_ms)
    cutoff_ews = EWSDateTime.from_datetime(cutoff).astimezone(tz)

    qs = (
        account.inbox
        .filter(is_read=False, datetime_received__gt=cutoff_ews)
        .order_by("-datetime_received")[:max_results]
    )

    out = sys.stdout
    for item in qs:
        record = {
            "message_id": item.message_id or item.id,
            "subject": item.subject or "",
            "sender": item.sender.email_address if item.sender else "",
            "received_time": (
                item.datetime_received.isoformat()
                if item.datetime_received else None
            ),
            "body_text": _clip(item.text_body or ""),
            "has_attachments": bool(item.has_attachments),
            "importance": str(item.importance) if item.importance else "Normal",
        }
        out.write(json.dumps(record, ensure_ascii=False) + "\n")

    out.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
