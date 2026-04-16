#!/usr/bin/env python3
"""
Real classification test: load one email from /tmp/iris_last_emails.json and
classify it with Claude Haiku using the same prompt as Classifier.ts.

Usage: python3 classify_email.py [INDEX]  (default INDEX=2, the 3rd email)
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
PROMPT_PATH = PROJECT_DIR / "prompts" / "classifier.md"
EMAILS_PATH = Path("/tmp/iris_last_emails.json")
MODEL = os.environ.get("IRIS_MODEL", "claude-haiku-4-5")
API_URL = "https://api.anthropic.com/v1/messages"


def load_env() -> None:
    env_file = PROJECT_DIR / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


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
    text = text.strip()
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    candidate = fence.group(1).strip() if fence else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return candidate[start:end + 1]


def call_haiku(api_key: str, system: str, user: str) -> dict:
    payload = {
        "model": MODEL,
        "max_tokens": 1024,
        "system": system,
        "messages": [{"role": "user", "content": user}],
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
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    load_env()
    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 2

    emails = json.loads(EMAILS_PATH.read_text(encoding="utf-8"))
    if idx >= len(emails):
        print(f"Index {idx} out of range (have {len(emails)} emails)", file=sys.stderr)
        return 2
    email = emails[idx]

    system = PROMPT_PATH.read_text(encoding="utf-8")
    user = build_user_prompt(email)
    api_key = os.environ["ANTHROPIC_API_KEY"]

    response = call_haiku(api_key, system, user)
    text_parts = [
        block["text"] for block in response.get("content", [])
        if block.get("type") == "text"
    ]
    raw_text = "\n".join(text_parts).strip()

    json_str = extract_json(raw_text)
    classification = json.loads(json_str) if json_str else None

    result = {
        "email_selected": {
            "sender": email.get("sender"),
            "subject": email.get("subject"),
            "received_time": email.get("received_time"),
        },
        "model": MODEL,
        "usage": response.get("usage"),
        "raw_response": raw_text,
        "classification": classification,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
