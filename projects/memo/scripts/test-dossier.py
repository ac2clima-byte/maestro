#!/usr/bin/env python3
"""
MEMO — test del dossier cliente.

Si connette al progetto Firebase COSMINA (garbymobile-f89ac) con le
credenziali utente (Application Default) e stampa un dossier aggregato
a console + apre un riassunto HTML nel browser.

Uso:
    python3 test-dossier.py <cliente_id_o_nome>
    python3 test-dossier.py Kristal
    python3 test-dossier.py  (senza arg → prompt interattivo)

Limitazione v0.1:
    Lo script va eseguito da un utente che ha Firestore Viewer su entrambi
    i progetti `garbymobile-f89ac` (COSMINA) e `nexo-hub-15f2d` (NEXO).
    Se lanciato in un environment senza permessi CRM, la lettura fallirà
    con "Permission denied" — comportamento atteso, non un bug.
"""
from __future__ import annotations

import json
import os
import sys
import webbrowser
from pathlib import Path
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import firestore
    from google.cloud.firestore_v1.base_query import FieldFilter
except ImportError:
    print("ERRORE: installa firebase-admin: pip install firebase-admin")
    sys.exit(1)

COSMINA_PROJECT_ID = os.environ.get("COSMINA_PROJECT_ID", "garbymobile-f89ac")
NEXO_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "nexo-hub-15f2d")

OUT_HTML = Path("/tmp/memo-dossier.html")


def init_apps():
    """Inizializza due app Firestore: default=NEXO, secondary=COSMINA."""
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": NEXO_PROJECT_ID})
    # Secondary app per COSMINA
    try:
        cosmina = firebase_admin.get_app("cosmina")
    except ValueError:
        cosmina = firebase_admin.initialize_app(
            options={"projectId": COSMINA_PROJECT_ID}, name="cosmina",
        )
    return (
        firestore.client(firebase_admin.get_app()),
        firestore.client(cosmina),
    )


def norm(s):
    return (s or "").lower().strip()


def find_cliente(cdb, ref):
    """Prova doc id diretto; se non trovato, fuzzy per nome."""
    doc = cdb.collection("crm_clienti").document(ref).get()
    if doc.exists:
        return doc
    # fuzzy search
    q = norm(ref)
    best = None
    best_score = 0
    for d in cdb.collection("crm_clienti").limit(500).stream():
        data = d.to_dict() or {}
        nome = data.get("nome") or data.get("ragione_sociale") or d.id
        if q in norm(nome):
            score = len(q) / max(1, len(norm(nome)))
            if score > best_score:
                best = d
                best_score = score
    return best


def build_dossier(nexo_db, cosmina_db, ref):
    cliente_doc = find_cliente(cosmina_db, ref)
    if not cliente_doc:
        raise RuntimeError(f'Cliente "{ref}" non trovato in crm_clienti.')
    cd = cliente_doc.to_dict() or {}
    cliente_id = cliente_doc.id
    nome = cd.get("nome") or cd.get("ragione_sociale") or cliente_id
    tipo = cd.get("tipo") or "privato"

    # Impianti
    impianti = []
    for d in cosmina_db.collection("cosmina_impianti") \
            .where(filter=FieldFilter("cliente_id", "==", cliente_id)).limit(50).stream():
        impianti.append({"id": d.id, **(d.to_dict() or {})})
    if not impianti and tipo == "condominio":
        for d in cosmina_db.collection("cosmina_impianti") \
                .where(filter=FieldFilter("condominio", "==", nome)).limit(50).stream():
            impianti.append({"id": d.id, **(d.to_dict() or {})})

    # Interventi
    interventi = []
    impianti_ids = [i["id"] for i in impianti][:10]
    if impianti_ids:
        for d in cosmina_db.collection("cosmina_interventi_pianificati") \
                .where(filter=FieldFilter("impianto_id", "in", impianti_ids)).limit(20).stream():
            interventi.append({"id": d.id, **(d.to_dict() or {})})

    # Email IRIS correlate (da NEXO)
    email_correlate = []
    try:
        q_nome = norm(nome)
        for d in nexo_db.collection("iris_emails") \
                .order_by("raw.received_time", direction=firestore.Query.DESCENDING) \
                .limit(200).stream():
            data = d.to_dict() or {}
            raw = data.get("raw") or {}
            cls = data.get("classification") or {}
            ent = cls.get("entities") or {}
            bag = " ".join(str(x) for x in [
                raw.get("subject"), raw.get("sender_name"),
                cls.get("summary"), ent.get("cliente"),
                ent.get("condominio"), ent.get("indirizzo"),
            ] if x)
            if q_nome in norm(bag):
                email_correlate.append({
                    "id": d.id,
                    "subject": raw.get("subject"),
                    "sender": raw.get("sender_name") or raw.get("sender"),
                    "received": str(raw.get("received_time") or ""),
                    "category": cls.get("category"),
                })
        email_correlate = email_correlate[:15]
    except Exception as e:
        print(f"[warn] iris_emails non leggibile: {e}")

    return {
        "clienteId": cliente_id,
        "nome": nome,
        "tipo": tipo,
        "contatti": {
            "email": cd.get("email"),
            "telefono": cd.get("telefono"),
            "pec": cd.get("pec"),
            "indirizzo": cd.get("indirizzo"),
            "comune": cd.get("comune"),
        },
        "fiscale": {"piva": cd.get("piva"), "cf": cd.get("cf")},
        "amministratore": cd.get("amministratore"),
        "impianti": impianti,
        "interventi": interventi,
        "emailCorrelate": email_correlate,
        "generatoIl": datetime.utcnow().isoformat() + "Z",
    }


def print_dossier(dossier):
    print("=" * 60)
    print(f"DOSSIER — {dossier['nome']}  ({dossier['clienteId']})")
    print(f"Tipo: {dossier['tipo']}")
    print("-" * 60)
    c = dossier["contatti"]
    if c.get("email"): print(f"  email:     {c['email']}")
    if c.get("telefono"): print(f"  telefono:  {c['telefono']}")
    if c.get("pec"): print(f"  pec:       {c['pec']}")
    if c.get("indirizzo"): print(f"  indirizzo: {c['indirizzo']}, {c.get('comune','')}")
    fis = dossier["fiscale"]
    if fis.get("piva") or fis.get("cf"):
        print(f"  fiscale:   piva={fis.get('piva','-')} cf={fis.get('cf','-')}")
    if dossier.get("amministratore"):
        print(f"  ammin.:    {dossier['amministratore']}")
    print()
    print(f"IMPIANTI ({len(dossier['impianti'])}):")
    for i, imp in enumerate(dossier["impianti"][:10], 1):
        print(f"  {i}. {imp.get('targa','-')} — {imp.get('marca','?')} {imp.get('modello','')} — {imp.get('indirizzo','')}")
    if len(dossier["impianti"]) > 10:
        print(f"  ...e altri {len(dossier['impianti'])-10}")
    print()
    print(f"INTERVENTI recenti ({len(dossier['interventi'])}):")
    for i, intv in enumerate(dossier["interventi"][:10], 1):
        print(f"  {i}. {intv.get('data_pianificata','?')} — {intv.get('tipo_intervento','?')} [{intv.get('stato','?')}] tecnico={intv.get('tecnico','-')}")
    print()
    print(f"EMAIL correlate IRIS ({len(dossier['emailCorrelate'])}):")
    for i, e in enumerate(dossier["emailCorrelate"][:10], 1):
        print(f"  {i}. [{str(e.get('received',''))[:10]}] {e.get('sender','?')} — {e.get('subject','')}")
    print("=" * 60)
    print(f"Generato il: {dossier['generatoIl']}")


def write_html(dossier):
    def esc(s): return str(s or "").replace("<","&lt;").replace(">","&gt;")
    rows_imp = "".join(
        f"<tr><td>{esc(imp.get('targa','-'))}</td>"
        f"<td>{esc(imp.get('marca','?'))} {esc(imp.get('modello',''))}</td>"
        f"<td>{esc(imp.get('indirizzo',''))}</td>"
        f"<td>{esc(str(imp.get('prossima_scadenza','-'))[:10])}</td></tr>"
        for imp in dossier["impianti"][:20]
    )
    rows_int = "".join(
        f"<tr><td>{esc(str(intv.get('data_pianificata','?'))[:10])}</td>"
        f"<td>{esc(intv.get('tipo_intervento','?'))}</td>"
        f"<td>{esc(intv.get('stato','?'))}</td>"
        f"<td>{esc(intv.get('tecnico','-'))}</td></tr>"
        for intv in dossier["interventi"][:15]
    )
    rows_mail = "".join(
        f"<tr><td>{esc(str(e.get('received',''))[:10])}</td>"
        f"<td>{esc(e.get('sender','?'))}</td>"
        f"<td>{esc(e.get('subject',''))}</td>"
        f"<td>{esc(e.get('category','-'))}</td></tr>"
        for e in dossier["emailCorrelate"][:20]
    )
    html = f"""<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<title>MEMO · {esc(dossier['nome'])}</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:980px;margin:30px auto;padding:0 20px;color:#0f172a}}
h1{{font-size:1.4rem;margin-bottom:4px}}
h2{{font-size:1rem;color:#64748b;margin-top:24px;text-transform:uppercase;letter-spacing:.5px}}
.meta{{color:#64748b;font-size:.85rem;margin-bottom:20px}}
table{{width:100%;border-collapse:collapse;margin-top:8px;font-size:.9rem}}
th,td{{padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0}}
th{{background:#f8fafc;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.3px;color:#64748b}}
.contatti{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px}}
.contatti dt{{font-weight:600;font-size:.78rem;color:#64748b;margin-top:8px;text-transform:uppercase;letter-spacing:.3px}}
.contatti dt:first-child{{margin-top:0}}
.contatti dd{{margin:4px 0 0 0;font-size:.92rem}}
.empty{{color:#94a3b8;font-style:italic;padding:10px 0}}
</style></head><body>
<h1>{esc(dossier['nome'])}</h1>
<div class="meta">cliente id: <code>{esc(dossier['clienteId'])}</code> · tipo: {esc(dossier['tipo'])} · generato {esc(dossier['generatoIl'])}</div>
<h2>Contatti</h2>
<dl class="contatti">
  <dt>Email</dt><dd>{esc(dossier['contatti'].get('email','-'))}</dd>
  <dt>Telefono</dt><dd>{esc(dossier['contatti'].get('telefono','-'))}</dd>
  <dt>PEC</dt><dd>{esc(dossier['contatti'].get('pec','-'))}</dd>
  <dt>Indirizzo</dt><dd>{esc(dossier['contatti'].get('indirizzo','-'))}, {esc(dossier['contatti'].get('comune','-'))}</dd>
  <dt>P.IVA</dt><dd>{esc(dossier['fiscale'].get('piva','-'))}</dd>
  <dt>CF</dt><dd>{esc(dossier['fiscale'].get('cf','-'))}</dd>
</dl>
<h2>Impianti ({len(dossier['impianti'])})</h2>
{'<table><tr><th>Targa</th><th>Marca / Modello</th><th>Indirizzo</th><th>Prox scadenza</th></tr>' + rows_imp + '</table>' if dossier['impianti'] else '<p class="empty">Nessun impianto collegato.</p>'}
<h2>Interventi recenti ({len(dossier['interventi'])})</h2>
{'<table><tr><th>Data</th><th>Tipo</th><th>Stato</th><th>Tecnico</th></tr>' + rows_int + '</table>' if dossier['interventi'] else '<p class="empty">Nessun intervento registrato.</p>'}
<h2>Email IRIS correlate ({len(dossier['emailCorrelate'])})</h2>
{'<table><tr><th>Data</th><th>Mittente</th><th>Oggetto</th><th>Categoria</th></tr>' + rows_mail + '</table>' if dossier['emailCorrelate'] else '<p class="empty">Nessuna email correlata.</p>'}
</body></html>
"""
    OUT_HTML.write_text(html, encoding="utf-8")
    return str(OUT_HTML)


def main():
    ref = sys.argv[1] if len(sys.argv) > 1 else input("Cliente (id o nome): ").strip()
    if not ref:
        print("Specifica un cliente.")
        return 1

    print(f"[memo] nexo={NEXO_PROJECT_ID}  cosmina={COSMINA_PROJECT_ID}")
    print(f"[memo] ricerca: {ref}")
    nexo_db, cosmina_db = init_apps()

    try:
        dossier = build_dossier(nexo_db, cosmina_db, ref)
    except Exception as e:
        print(f"\nERRORE: {e}")
        print("\nPossibili cause:")
        print("  1. Credenziali senza accesso a garbymobile-f89ac")
        print("     → esegui: gcloud auth application-default login")
        print("  2. Cliente non esiste (typo nel nome?)")
        return 2

    print_dossier(dossier)

    html_path = write_html(dossier)
    print(f"\nHTML: {html_path}")
    try:
        # WSL: apre via Windows
        import subprocess
        subprocess.run(["cmd.exe", "/c", "start", html_path], check=False)
    except Exception:
        try:
            webbrowser.open(f"file://{html_path}")
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
