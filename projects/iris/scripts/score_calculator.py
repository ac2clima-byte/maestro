"""
Score calculator — calcola la priorità dinamica di una email IRIS.

Score 0-100 derivato da campi già presenti in iris_emails:
  - Categoria (urgente: GUASTO_URGENTE / PEC_UFFICIALE)
  - Sentiment (arrabbiato/disperato/frustrato)
  - Giorni senza risposta (da F3.followup)
  - isFollowup (da F3.followup)
  - Allegati presenti
  - Importo estratto da fattura > 1000€ (da F6.attachments[].amount)

Pure function, niente I/O. Deterministico.
"""
from __future__ import annotations

import re

URGENT_CATEGORIES = {"GUASTO_URGENTE", "PEC_UFFICIALE"}

# Sentiment weights (gradiente, il task ne menziona uno solo).
SENTIMENT_WEIGHTS = {
    "disperato": 25,
    "arrabbiato": 20,
    "frustrato": 10,
    "neutro": 0,
    "positivo": 0,
}

URGENT_BONUS = 30
FOLLOWUP_BONUS = 15
ATTACHMENT_BONUS = 5
HIGH_AMOUNT_BONUS = 10
HIGH_AMOUNT_THRESHOLD_EUR = 1000.0
DAYS_WITHOUT_REPLY_PER_DAY = 5
MAX_DAYS_BONUS = 50  # cap sui giorni per evitare runaway (es. 10 giorni = +50)
SCORE_CAP = 100


# Match "1.250,00" (italiano) o "1,250.00" (inglese) o "850" / "850,00" / "850.00".
_AMOUNT_RE = re.compile(r"\d[\d.,\s]*\d|\d")


def _amount_to_float(s: str | None) -> float | None:
    """Parsa "EUR 1.250,00" / "€ 850" / "1250.00" / "1,250.00" → float in euro."""
    if not s:
        return None
    m = _AMOUNT_RE.search(str(s))
    if not m:
        return None
    raw = m.group(0).replace(" ", "")
    has_comma = "," in raw
    has_dot = "." in raw
    if has_comma and has_dot:
        # Decide chi è il decimale: l'ultimo simbolo che compare.
        if raw.rfind(",") > raw.rfind("."):
            # italiano "1.250,00"
            raw = raw.replace(".", "").replace(",", ".")
        else:
            # inglese "1,250.00"
            raw = raw.replace(",", "")
    elif has_comma:
        # solo virgola: italiano "1250,00"
        raw = raw.replace(",", ".")
    # solo punto: già OK (decimale inglese o intero)
    try:
        return float(raw)
    except ValueError:
        return None


def compute_score(doc: dict) -> int:
    """
    doc: shape conforme a IrisEmailDoc (raw, classification, followup,
    attachments). Ritorna intero 0-100.
    """
    cls = doc.get("classification") or {}
    raw = doc.get("raw") or {}
    fu = doc.get("followup") or {}
    attachments = doc.get("attachments") or []

    score = 0

    # 1. Urgent category.
    if cls.get("category") in URGENT_CATEGORIES:
        score += URGENT_BONUS

    # 2. Sentiment.
    score += SENTIMENT_WEIGHTS.get(cls.get("sentiment"), 0)

    # 3. Days without reply (cap MAX_DAYS_BONUS).
    days = fu.get("daysWithoutReply") or 0
    if isinstance(days, (int, float)) and days > 0:
        # Solo se needsAttention è True (altrimenti è "rispose dopo N giorni").
        if fu.get("needsAttention"):
            score += min(int(days) * DAYS_WITHOUT_REPLY_PER_DAY, MAX_DAYS_BONUS)

    # 4. Follow-up.
    if fu.get("isFollowup"):
        score += FOLLOWUP_BONUS

    # 5. Has attachments.
    if raw.get("has_attachments") or attachments:
        score += ATTACHMENT_BONUS

    # 6. High-value invoice (importo > 1000€).
    for a in attachments:
        amt = _amount_to_float(a.get("amount"))
        if amt is not None and amt > HIGH_AMOUNT_THRESHOLD_EUR:
            score += HIGH_AMOUNT_BONUS
            break  # una volta basta

    return min(score, SCORE_CAP)
