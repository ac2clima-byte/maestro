"""
Attachment tagger — classifica gli allegati per tipo (fattura, ddt, preventivo,
scheda_tecnica, contratto, foto, altro) usando filename, MIME e — per i PDF —
il testo delle prime pagine.

Pure functions, niente I/O. Il fetch del binario PDF avviene nel pipeline.
"""
from __future__ import annotations

import re

# Tipi di allegato riconosciuti.
TYPE_FATTURA = "fattura"
TYPE_DDT = "ddt"
TYPE_PREVENTIVO = "preventivo"
TYPE_SCHEDA_TECNICA = "scheda_tecnica"
TYPE_CONTRATTO = "contratto"
TYPE_FOTO = "foto"
TYPE_ALTRO = "altro"

ALL_TYPES = (
    TYPE_FATTURA, TYPE_DDT, TYPE_PREVENTIVO, TYPE_SCHEDA_TECNICA,
    TYPE_CONTRATTO, TYPE_FOTO, TYPE_ALTRO,
)

# Keyword set per ciascun tipo. La presenza nel filename pesa più del testo.
KEYWORDS = {
    TYPE_FATTURA: [
        "fattura", "fattur", "ft_", "ft-", "ftpa", "invoice",
        "fatt elett", "fattura elettronica", "xml-fattura", "metadata-fattura",
    ],
    TYPE_DDT: [
        "ddt", "documento di trasporto", "bolla", "consegna", "delivery note",
    ],
    TYPE_PREVENTIVO: [
        "preventivo", "offerta", "quotazione", "quote", "estimate",
        "proposta economica",
    ],
    TYPE_SCHEDA_TECNICA: [
        "scheda tecnica", "datasheet", "data sheet", "manuale", "libretto",
        "specifiche tecniche", "ts_", "scheda_tecnica",
    ],
    TYPE_CONTRATTO: [
        "contratto", "accordo", "convenzione", "agreement",
    ],
}

# MIME types comuni → categoria di base.
IMAGE_MIMES = (
    "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
    "image/heic", "image/bmp", "image/tiff",
)
PDF_MIMES = ("application/pdf",)


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


def detect_type(
    filename: str | None,
    mime_type: str | None,
    extracted_text: str | None = None,
) -> str:
    """
    Classifica l'allegato. Priorità:
      1. Immagine → foto
      2. Match keyword nel filename (specifico > generico, fattura > preventivo,
         contratto > altro).
      3. Match keyword nel testo estratto.
      4. PDF generico → altro
    """
    name = _norm(filename)
    mime = _norm(mime_type)
    text = _norm(extracted_text)[:2000]  # safety cap

    if mime in IMAGE_MIMES or name.endswith(
        (".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".bmp", ".tiff")
    ):
        return TYPE_FOTO

    # filename — ordine di priorità per gestire ambiguità (es. "preventivo
    # fattura" → fattura più specifico business).
    priority_order = [
        TYPE_FATTURA, TYPE_DDT, TYPE_CONTRATTO,
        TYPE_PREVENTIVO, TYPE_SCHEDA_TECNICA,
    ]
    for t in priority_order:
        for kw in KEYWORDS[t]:
            if kw in name:
                return t

    if text:
        for t in priority_order:
            for kw in KEYWORDS[t]:
                if kw in text:
                    return t

    return TYPE_ALTRO


# --- Estrazione importo da fatture ---
# Cerca pattern monetari italiani: "1.250,00 EUR", "€ 1.250,00", "EUR 1250,00".
_AMOUNT_RE = re.compile(
    r"(?:€|eur|euro)\s*([0-9]{1,3}(?:[\.\s][0-9]{3})*(?:,[0-9]{2})?)"
    r"|"
    r"([0-9]{1,3}(?:[\.\s][0-9]{3})*(?:,[0-9]{2}))\s*(?:€|eur|euro)",
    re.IGNORECASE,
)


def extract_amount(text: str | None) -> str | None:
    """Ritorna il primo importo trovato come string normalizzata 'EUR X,YY' o None."""
    if not text:
        return None
    m = _AMOUNT_RE.search(text)
    if not m:
        return None
    raw = (m.group(1) or m.group(2) or "").replace(" ", "").strip()
    if not raw:
        return None
    return f"EUR {raw}"


# --- PDF text extraction ---
def extract_pdf_text(
    pdf_bytes: bytes,
    max_pages: int = 2,
    max_chars: int = 1500,
) -> str:
    """
    Estrae testo dalle prime `max_pages` pagine. Usa pypdfium2 se disponibile
    (più veloce), altrimenti pdfplumber, altrimenti pypdf. Ritorna stringa
    troncata a `max_chars` o "" se non riesce.
    """
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(pdf_bytes)
        out = []
        for i in range(min(max_pages, len(pdf))):
            page = pdf[i]
            tp = page.get_textpage()
            out.append(tp.get_text_range())
            tp.close()
            page.close()
        pdf.close()
        return "\n".join(out)[:max_chars]
    except Exception:
        pass
    try:
        import io
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            out = []
            for i, page in enumerate(pdf.pages[:max_pages]):
                out.append(page.extract_text() or "")
            return "\n".join(out)[:max_chars]
    except Exception:
        pass
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        out = []
        for i, page in enumerate(reader.pages[:max_pages]):
            out.append(page.extract_text() or "")
        return "\n".join(out)[:max_chars]
    except Exception:
        return ""
