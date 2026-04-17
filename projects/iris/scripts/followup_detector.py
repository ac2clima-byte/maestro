"""
FollowupDetector — rileva solleciti e email senza risposta.

Per ogni email "in" (ricevuta) calcola:
  - is_followup: True se esiste una email "in" precedente, stesso mittente,
    stesso subject normalizzato, senza una nostra risposta "out" nel mezzo.
  - original_email_id: id dell'email "in" precedente nello stesso thread.
  - days_without_reply: giorni trascorsi senza che noi rispondiamo
    (calcolato rispetto a `now` se non c'è risposta, o rispetto alla
    risposta più recente).
  - needs_attention: True se l'email richiede risposta e non l'ha ancora
    ricevuta dopo `attention_after_hours` (default 48h).

Le email "out" sono lette dalla cartella Sent Items via EWS (read-only).
Sender e destinatari sono normalizzati (lowercase + trim) e si raggruppa
per (normalized_subject, controparte) — la controparte è il sender per le
"in" e il primo destinatario per le "out".

Categoria che NON richiede risposta (skip needs_attention):
  NEWSLETTER_SPAM, COMUNICAZIONE_INTERNA (la maggior parte sono FYI),
  CONFERMA_APPUNTAMENTO, FATTURA_FORNITORE.
La logica è generosa: se la classificazione suggerisce ARCHIVIA,
l'attenzione è disabilitata.
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# Reuse subject normalization from ThreadDetector to keep grouping coherent.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from thread_detector import normalize_subject  # noqa: E402


# Categorie che NON richiedono follow-up automatico.
NO_REPLY_CATEGORIES = {
    "NEWSLETTER_SPAM",
    "FATTURA_FORNITORE",
    "CONFERMA_APPUNTAMENTO",
}
NO_REPLY_ACTIONS = {"ARCHIVIA"}


def _norm_addr(addr: Optional[str]) -> str:
    return (addr or "").strip().lower()


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept ISO8601 with Z or offset.
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class FollowupDetector:
    """
    incoming: list of dicts {"id": str, "sender": str, "subject": str,
        "received_time": iso, "category": str, "suggestedAction": str}
    outgoing: list of dicts {"to": [str], "subject": str, "sent_time": iso}
    now: optional datetime override (for tests). Default = utcnow.
    """

    def __init__(self, attention_after_hours: float = 48.0):
        self.attention_after_hours = attention_after_hours

    def detect(
        self,
        incoming: list[dict],
        outgoing: list[dict],
        now: Optional[datetime] = None,
    ) -> dict[str, dict]:
        now = now or datetime.now(timezone.utc)

        # Index outgoing by (normalized_subject, normalized recipient).
        # We keep all sent timestamps for that pair.
        sent_by_key: dict[tuple[str, str], list[datetime]] = {}
        for o in outgoing:
            subj = normalize_subject(o.get("subject"))
            ts = _parse_dt(o.get("sent_time"))
            if not subj or not ts:
                continue
            for to in (o.get("to") or []):
                key = (subj, _norm_addr(to))
                sent_by_key.setdefault(key, []).append(ts)
        for v in sent_by_key.values():
            v.sort()

        # Group incoming by (normalized_subject, sender) — chronological.
        in_by_key: dict[tuple[str, str], list[dict]] = {}
        normalized_in = []
        for e in incoming:
            subj = normalize_subject(e.get("subject"))
            sender = _norm_addr(e.get("sender"))
            ts = _parse_dt(e.get("received_time"))
            entry = {
                "id": e.get("id"),
                "subject_norm": subj,
                "sender": sender,
                "received": ts,
                "category": e.get("category"),
                "action": e.get("suggestedAction"),
            }
            normalized_in.append(entry)
            if subj and sender and ts:
                in_by_key.setdefault((subj, sender), []).append(entry)
        for v in in_by_key.values():
            v.sort(key=lambda x: x["received"])

        out: dict[str, dict] = {}
        attn_delta = timedelta(hours=self.attention_after_hours)

        for entry in normalized_in:
            eid = entry["id"]
            received = entry["received"]
            sender = entry["sender"]
            subj = entry["subject_norm"]
            category = entry["category"]
            action = entry["action"]

            sent_list = sent_by_key.get((subj, sender), [])

            # Have we already replied AFTER this email was received?
            replied_after: Optional[datetime] = None
            if received:
                future_replies = [t for t in sent_list if t > received]
                if future_replies:
                    replied_after = min(future_replies)

            # days_without_reply: tempo tra ricezione e (risposta o now).
            if received:
                end = replied_after or now
                days = max(0, int((end - received).total_seconds() // 86400))
            else:
                days = 0

            # is_followup: precedente email "in" stesso (subject, sender)
            # senza nostra risposta in mezzo.
            original_id: Optional[str] = None
            if subj and sender and received:
                history = in_by_key.get((subj, sender), [])
                prev_entries = [
                    h for h in history if h["received"] and h["received"] < received
                ]
                if prev_entries:
                    prev = prev_entries[-1]  # più recente prima di noi
                    # rispondemmo tra prev e received?
                    replied_in_between = any(
                        prev["received"] < t <= received for t in sent_list
                    )
                    if not replied_in_between:
                        original_id = prev["id"]

            is_followup = original_id is not None

            # needs_attention: ricevuta, non ancora risposta, categoria che
            # richiede risposta, oltre la soglia.
            needs_attention = False
            if (
                received
                and replied_after is None
                and category not in NO_REPLY_CATEGORIES
                and action not in NO_REPLY_ACTIONS
                and (now - received) >= attn_delta
            ):
                needs_attention = True

            out[eid] = {
                "isFollowup": is_followup,
                "originalEmailId": original_id,
                "daysWithoutReply": days,
                "needsAttention": needs_attention,
            }

        return out
