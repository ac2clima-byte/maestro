#!/usr/bin/env python3
"""
memo_carica_clienti.py — scansiona TUTTI i clienti e gli impianti di COSMINA
(progetto Firebase garbymobile-f89ac) e salva una cache in nexo-hub-15f2d
(collection memo_clienti_cache).

Output:
  - Un documento per cliente in memo_clienti_cache/{codice_acg}
  - Un documento stats in memo_clienti_cache/_stats
  - Riepilogo markdown in context/memo-clienti-cosmina.md
  - Log console con totali

Uso:
  python3 scripts/memo_carica_clienti.py
"""

from __future__ import annotations

import sys
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import firestore


# ─── Setup Firebase ────────────────────────────────────────────
def init_apps():
    cosm_app = firebase_admin.initialize_app(
        options={"projectId": "garbymobile-f89ac"}, name="cosmina",
    )
    nexo_app = firebase_admin.initialize_app(
        options={"projectId": "nexo-hub-15f2d"}, name="nexo",
    )
    return firestore.client(cosm_app), firestore.client(nexo_app)


# ─── Util ──────────────────────────────────────────────────────
def safe_str(v, default=""):
    if v is None:
        return default
    if isinstance(v, (str, int, float, bool)):
        return str(v)
    return str(v)


def pick(d, *keys, default=None):
    """Prima chiave non-vuota trovata nel dict."""
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return default


def classify_tipo(c):
    """Inferisce tipo cliente da campi."""
    nome_lower = (
        (c.get("nome") or "")
        + " "
        + (c.get("ragione_sociale") or "")
        + " "
        + (c.get("denominazione") or "")
    ).lower()
    if any(k in nome_lower for k in ["condominio", "cond.", "edificio"]):
        return "condominio"
    if c.get("amministratore"):
        return "condominio"
    if any(k in nome_lower for k in ["s.r.l.", "srl", "s.p.a.", "spa", "s.a.s.", "s.n.c.", "snc"]):
        return "azienda"
    return "privato"


# ─── Scan clienti ──────────────────────────────────────────────
def scan_clienti(cosm_db):
    """Legge TUTTI i documenti da crm_clienti."""
    print("[clienti] lettura crm_clienti…", flush=True)
    snap = cosm_db.collection("crm_clienti").stream()
    clienti = {}
    for d in snap:
        v = d.to_dict() or {}
        codice = d.id
        nome = pick(v, "nome", "ragione_sociale", "denominazione", default=codice)
        clienti[codice] = {
            "codice": codice,
            "nome": safe_str(nome).strip(),
            "indirizzo": safe_str(pick(v, "indirizzo", "via")),
            "cap": safe_str(v.get("cap")),
            "citta": safe_str(pick(v, "citta", "comune")),
            "provincia": safe_str(v.get("provincia")),
            "telefono": safe_str(pick(v, "telefono", "tel", "cellulare")),
            "email": safe_str(pick(v, "email", "mail")),
            "pec": safe_str(v.get("pec")),
            "piva": safe_str(pick(v, "piva", "p_iva", "partita_iva")),
            "codice_fiscale": safe_str(v.get("codice_fiscale")),
            "amministratore": safe_str(v.get("amministratore")),
            "referente": safe_str(pick(v, "referente", "contatto")),
            "tipo": classify_tipo(v),
            "contratto_attivo": bool(v.get("contratto_attivo") or v.get("contratto_manutenzione")),
            "campagne": v.get("campagne") or [],
            "cartella_rete": safe_str(v.get("cartella_rete")),
            "note": safe_str(v.get("note"))[:500],
        }
    print(f"[clienti] {len(clienti)} clienti caricati")
    return clienti


# ─── Scan impianti ─────────────────────────────────────────────
def _normalize_nome(s):
    """Normalizza un nome per matching (lowercase, rimuove 'condominio', spazi multipli)."""
    if not s:
        return ""
    s = str(s).strip().lower()
    s = s.replace("cond.", "").replace("condominio", "").strip()
    s = " ".join(s.split())
    return s


def scan_impianti(cosm_db, clienti):
    """Legge cosmina_impianti e li raggruppa per cliente.

    Il mapping è per NOME: cosmina_impianti non ha FK stabile. Si usano:
      - proprietario_cognome + proprietario_nome
      - occupante_cognome + occupante_nome
      - (fallback) indirizzo match
    """
    # Pre-indicizza i clienti per nome normalizzato
    client_by_nome = {}
    for c in clienti.values():
        key = _normalize_nome(c["nome"])
        if key:
            client_by_nome.setdefault(key, []).append(c["codice"])

    print("[impianti] lettura cosmina_impianti…", flush=True)
    snap = cosm_db.collection("cosmina_impianti").stream()
    per_cliente = defaultdict(list)
    total = 0
    matched = 0
    for d in snap:
        v = d.to_dict() or {}
        total += 1

        # Costruisci candidati dai campi nome
        candidates = []
        for k in ("proprietario_cognome", "occupante_cognome", "proprietario_nome", "occupante_nome"):
            val = v.get(k)
            if val:
                candidates.append(str(val))
        # Concatena se ci sono sia cognome che nome ("CONDOMINIO UGO GOLA" come stringa unica)
        full1 = " ".join(filter(None, [v.get("proprietario_cognome"), v.get("proprietario_nome")])).strip()
        full2 = " ".join(filter(None, [v.get("occupante_cognome"), v.get("occupante_nome")])).strip()
        if full1:
            candidates.append(full1)
        if full2:
            candidates.append(full2)

        # Trova il cliente con match più lungo
        cliente_id = None
        for cand in candidates:
            norm = _normalize_nome(cand)
            if not norm or len(norm) < 4:
                continue
            # Exact match prima
            if norm in client_by_nome:
                cliente_id = client_by_nome[norm][0]
                break
            # Contains match (es: "le ginestre" contro "le ginestre scala A")
            for client_key, ids in client_by_nome.items():
                if len(client_key) >= 4 and (norm in client_key or client_key in norm):
                    cliente_id = ids[0]
                    break
            if cliente_id:
                break

        if not cliente_id:
            nome_imp = candidates[0] if candidates else "?"
            cliente_id = f"_nomatch_{_normalize_nome(nome_imp)[:40]}"
        else:
            matched += 1

        imp = {
            "id": d.id,
            "tipo": safe_str(pick(v, "tipologia", "tipo")),
            "marca": safe_str(v.get("marca")),
            "modello": safe_str(v.get("modello")),
            "combustibile": safe_str(v.get("combustibile")),
            "potenza": safe_str(v.get("potenza")),
            "matricola": safe_str(pick(v, "targa", "matricola", "codice_impianto", "codice")),
            "anno": safe_str(pick(v, "data_installazione", "data_costruzione", "anno")),
            "indirizzo": safe_str(v.get("indirizzo")),
            "comune": safe_str(v.get("comune")),
            "stato": safe_str(v.get("stato")),
            "data_prossimo_contributo": safe_str(v.get("data_prossimo_contributo")),
            "data_scadenza_dichiarazione": safe_str(v.get("data_scadenza_dichiarazione")),
            "stato_contributo": safe_str(v.get("stato_contributo")),
            "responsabile": safe_str(v.get("responsabile")),
            "terzo_responsabile": safe_str(" ".join(filter(None, [v.get("terzo_responsabile_cognome"), v.get("terzo_responsabile_nome")])).strip()),
        }
        per_cliente[cliente_id].append(imp)

    nomatch_count = sum(1 for k in per_cliente if k.startswith("_nomatch_"))
    print(f"[impianti] {total} impianti · {matched} matchati a clienti · {nomatch_count} chiavi senza match")
    return per_cliente, total


# ─── Scrivi cache su nexo-hub ──────────────────────────────────
def write_cache(nexo_db, clienti, impianti_per_cliente):
    print("[cache] scrittura memo_clienti_cache su nexo-hub-15f2d…", flush=True)
    now = datetime.now(timezone.utc)
    batch = nexo_db.batch()
    written = 0
    BATCH_SIZE = 400

    for codice, c in clienti.items():
        imps = impianti_per_cliente.get(codice, [])
        # Cap impianti per non esplodere doc size (Firestore max 1MB)
        imps_capped = imps[:30]
        doc = {
            **c,
            "impianti": imps_capped,
            "num_impianti": len(imps),
            "ultima_scansione": firestore.SERVER_TIMESTAMP,
            "scansione_at_iso": now.isoformat(),
        }
        ref = nexo_db.collection("memo_clienti_cache").document(codice)
        batch.set(ref, doc)
        written += 1
        if written % BATCH_SIZE == 0:
            batch.commit()
            batch = nexo_db.batch()
            print(f"  … {written} clienti scritti")

    # Stats aggregate
    tot_impianti = sum(len(v) for v in impianti_per_cliente.values())
    stats = {
        "totale_clienti": len(clienti),
        "totale_impianti": tot_impianti,
        "clienti_con_impianti": sum(1 for c in clienti if impianti_per_cliente.get(c)),
        "per_tipo": {
            t: sum(1 for c in clienti.values() if c["tipo"] == t)
            for t in ["privato", "condominio", "azienda"]
        },
        "ultima_scansione": firestore.SERVER_TIMESTAMP,
        "scansione_at_iso": now.isoformat(),
    }
    batch.set(nexo_db.collection("memo_clienti_cache").document("_stats"), stats)
    batch.commit()
    print(f"[cache] scritti {written} clienti + _stats")
    return stats, tot_impianti


# ─── Riepilogo markdown ────────────────────────────────────────
def write_markdown(clienti, impianti_per_cliente, stats, out_path):
    lines = []
    lines.append("# MEMO — Cache clienti COSMINA")
    lines.append("")
    lines.append(f"Aggiornata: {stats['scansione_at_iso']}  ·  Fonte: `crm_clienti` + `cosmina_impianti` (garbymobile-f89ac)  ·  Cache: `memo_clienti_cache` (nexo-hub-15f2d)")
    lines.append("")
    lines.append("## Totali")
    lines.append("")
    lines.append(f"- **Clienti totali**: {stats['totale_clienti']}")
    lines.append(f"- **Impianti totali**: {stats['totale_impianti']}")
    lines.append(f"- **Clienti con almeno 1 impianto**: {stats['clienti_con_impianti']}")
    lines.append("")
    lines.append("### Per tipo cliente")
    for t, n in sorted(stats["per_tipo"].items(), key=lambda x: -x[1]):
        lines.append(f"- {t.capitalize()}: **{n}**")
    lines.append("")

    # Top 20 per numero impianti
    lines.append("## Top 20 clienti per numero impianti")
    lines.append("")
    lines.append("| Codice | Nome | Impianti | Indirizzo |")
    lines.append("|---|---|---|---|")
    top = sorted(
        clienti.values(),
        key=lambda c: -len(impianti_per_cliente.get(c["codice"], [])),
    )[:20]
    for c in top:
        n_imp = len(impianti_per_cliente.get(c["codice"], []))
        if n_imp == 0:
            continue
        indirizzo = ", ".join(filter(None, [c.get("indirizzo"), c.get("citta")]))
        lines.append(f"| `{c['codice']}` | {c['nome'][:50]} | {n_imp} | {indirizzo[:60]} |")
    lines.append("")

    # Lista prime 50 (per chiunque voglia fare grep veloce)
    lines.append("## Primi 50 clienti (alfabetico)")
    lines.append("")
    lines.append("| Codice | Nome | Città | Tipo |")
    lines.append("|---|---|---|---|")
    for c in sorted(clienti.values(), key=lambda x: x["nome"].lower())[:50]:
        lines.append(f"| `{c['codice']}` | {c['nome'][:50]} | {c.get('citta','')[:25]} | {c['tipo']} |")
    lines.append("")
    lines.append(f"_Totale {stats['totale_clienti']} clienti, qui i primi 50 alfabetici. Lista completa in Firestore `memo_clienti_cache`._")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[markdown] salvato in {out_path}")


# ─── Main ──────────────────────────────────────────────────────
def main():
    cosm_db, nexo_db = init_apps()

    clienti = scan_clienti(cosm_db)
    impianti_per_cliente, tot_imp = scan_impianti(cosm_db, clienti)

    stats, tot_imp = write_cache(nexo_db, clienti, impianti_per_cliente)

    # Riepilogo markdown
    repo_dir = Path(__file__).resolve().parent.parent
    out_md = repo_dir / "context" / "memo-clienti-cosmina.md"
    write_markdown(clienti, impianti_per_cliente, stats, out_md)

    # Log finale
    print()
    print("═══ RIEPILOGO ═══")
    print(f"Clienti scansionati: {stats['totale_clienti']}")
    print(f"Impianti totali: {stats['totale_impianti']}")
    print(f"Clienti con impianti: {stats['clienti_con_impianti']}")
    print(f"Per tipo: {stats['per_tipo']}")
    print(f"Cache: nexo-hub-15f2d/memo_clienti_cache ({stats['totale_clienti']} doc + _stats)")
    print(f"Markdown: {out_md}")


if __name__ == "__main__":
    main()
