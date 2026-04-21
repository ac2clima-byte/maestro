#!/usr/bin/env python3
"""Estrae i 4 GRTI fatturabili in stato 'definito' senza GRTIDF."""
import sys, json
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit(1)

cred = credentials.ApplicationDefault()
try:
    firebase_admin.initialize_app(cred, {"projectId": "guazzotti-tec"})
except ValueError:
    pass
db = firestore.client()
NOW = datetime.now(timezone.utc)

def classify_tipo(doc, col):
    t = str(doc.get("tipo","")).lower()
    if t in ("generico","contabilizzazione"): return t
    n = str(doc.get("numero_rti") or doc.get("numero_rtidf") or doc.get("_id") or "").upper()
    if col == "rti":
        if n.startswith("GRTI"): return "generico"
        if n.startswith("CRTI"): return "contabilizzazione"
    elif col == "rtidf":
        if n.startswith("GRTIDF"): return "generico"
        if n.startswith("CRTIDF"): return "contabilizzazione"
    return "?"

# Carica
rti_all = []
for d in db.collection("rti").limit(700).stream():
    dt = d.to_dict() or {}; dt["_id"] = d.id
    rti_all.append(dt)
rtidf_all = []
for d in db.collection("rtidf").limit(700).stream():
    dt = d.to_dict() or {}; dt["_id"] = d.id
    rtidf_all.append(dt)

# Indice GRTIDF
grtidf = [d for d in rtidf_all if classify_tipo(d, "rtidf") == "generico"]
rtidf_by_num = {str(d.get("numero_rti_origine","")): d for d in grtidf}
rtidf_by_id  = {str(d.get("rti_origine_id","")): d for d in grtidf}

# Trova GRTI 'definito' fatturabili senza GRTIDF
grti = [d for d in rti_all if classify_tipo(d, "rti") == "generico"]
out = []
for d in grti:
    stato = str(d.get("stato","")).lower()
    if stato != "definito": continue
    if d.get("fatturabile") is False: continue
    num = str(d.get("numero_rti",""))
    rid = str(d.get("_id",""))
    iid = str(d.get("id",""))
    if num in rtidf_by_num: continue
    if rid in rtidf_by_id: continue
    if iid and iid in rtidf_by_id: continue
    out.append(d)

print(f"Trovati {len(out)} GRTI fatturabili 'definito' senza GRTIDF\n")

result = []
for i, d in enumerate(out, 1):
    row = {
        "numero_rti": d.get("numero_rti"),
        "_id": d.get("_id"),
        "stato": d.get("stato"),
        "fatturabile": d.get("fatturabile"),
        "tipo": d.get("tipo"),
        "cliente": d.get("cliente"),
        "condominio": d.get("condominio"),
        "indirizzo": d.get("indirizzo"),
        "telefono": d.get("telefono"),
        "tecnico_intervento": d.get("tecnico_intervento"),
        "numero_operai": d.get("numero_operai"),
        "ore_lavorate": d.get("ore_lavorate"),
        "data_ticket": d.get("data_ticket"),
        "data_intervento": d.get("data_intervento"),
        "data_documento": d.get("data_documento"),
        "stato_modificato_il": d.get("stato_modificato_il"),
        "fatturabile_modificato_il": d.get("fatturabile_modificato_il"),
        "_lastModified": d.get("_lastModified"),
        "_modifiedBy": d.get("_modifiedBy"),
        "numero_ticket_collegato": d.get("numero_ticket_collegato"),
        "ticket_collegato": d.get("ticket_collegato"),
        "commessa": d.get("commessa"),
        "intervento_richiesto": (d.get("intervento_richiesto") or "")[:300],
        "intervento_effettuato": (d.get("intervento_effettuato") or "")[:300],
        "materiale_utilizzato": d.get("materiale_utilizzato"),
        "materiali_count": len(d.get("materiali") or []),
        "note": d.get("note"),
        "email_inviata": d.get("email_inviata"),
        "email_destinatario": d.get("email_destinatario"),
        "email_inviata_il": d.get("email_inviata_il"),
    }
    # Calcola giorni da intervento
    di = d.get("data_intervento") or ""
    try:
        if "-" in di and len(di) >= 10:
            dt = datetime.strptime(di[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            row["giorni_da_intervento"] = (NOW - dt).days
    except Exception: pass
    result.append(row)
    print(f"── #{i}: {row['numero_rti']} ──────────────────────────")
    for k,v in row.items():
        if v is None or v == "": continue
        s = str(v)
        if len(s) > 200: s = s[:200] + "…"
        print(f"  {k}: {s}")
    print()

with open("/home/albertocontardi/maestro-bridge/scripts/memo_4_grti.json","w") as f:
    json.dump(result, f, indent=2, default=str)
print(f"✅ Export: scripts/memo_4_grti.json")
