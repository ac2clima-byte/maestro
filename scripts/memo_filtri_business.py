#!/usr/bin/env python3
"""memo_filtri_business.py — ricalcola alert con regole business.

Regole:
1. Escludi RTI con stato=rtidf_fatturato (già fatturato)
2. Escludi RTIDF con stato=fatturato (già fatturato)
3. RTI definito senza RTIDF → conta solo fatturabile=true
4. CRTIDF senza costo = NORMALE, non è alert
5. Bozze CRTI vecchie → resta alert valido
"""
import sys, json
from datetime import datetime, timezone
from collections import Counter

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

def parse_date(v):
    if v is None: return None
    try:
        if hasattr(v, "to_datetime"): return v.to_datetime()
        if isinstance(v, datetime): return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        s = str(v).strip()
        if not s: return None
        for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ","%Y-%m-%dT%H:%M:%SZ","%Y-%m-%dT%H:%M:%S","%Y-%m-%d"):
            try:
                d = datetime.strptime(s.split("+")[0][:len(fmt)+8], fmt)
                return d.replace(tzinfo=timezone.utc)
            except: pass
        if "/" in s:
            p = s.split("/")[:3]
            if len(p) == 3:
                return datetime(int(p[2][:4]), int(p[1]), int(p[0]), tzinfo=timezone.utc)
    except: pass
    return None

def days_ago(d):
    return (NOW - d).days if d else None

def classify_tipo(doc, col):
    tipo = str(doc.get("tipo","")).lower()
    if tipo in ("generico","contabilizzazione"): return tipo
    n = str(doc.get("numero_rti") or doc.get("numero_rtidf") or doc.get("_id") or "").upper()
    if col == "rti":
        if n.startswith("GRTI"): return "generico"
        if n.startswith("CRTI"): return "contabilizzazione"
    elif col == "rtidf":
        if n.startswith("GRTIDF"): return "generico"
        if n.startswith("CRTIDF"): return "contabilizzazione"
    return "?"

def scan(col):
    return [(lambda d: {**d, "_id": doc.id})(doc.to_dict() or {}) for doc in db.collection(col).limit(700).stream() for _ in [0]][:]

# Carica
print("→ Carico rti + rtidf…")
rti_all = []
for d in db.collection("rti").limit(700).stream():
    dt = d.to_dict() or {}; dt["_id"] = d.id
    rti_all.append(dt)
rtidf_all = []
for d in db.collection("rtidf").limit(700).stream():
    dt = d.to_dict() or {}; dt["_id"] = d.id
    rtidf_all.append(dt)

print(f"  rti: {len(rti_all)}  rtidf: {len(rtidf_all)}")

# ── Split per tipo
rti_gen = [d for d in rti_all if classify_tipo(d,"rti")=="generico"]
rti_con = [d for d in rti_all if classify_tipo(d,"rti")=="contabilizzazione"]
rtidf_gen = [d for d in rtidf_all if classify_tipo(d,"rtidf")=="generico"]
rtidf_con = [d for d in rtidf_all if classify_tipo(d,"rtidf")=="contabilizzazione"]

# ── ANALISI FATTURABILE ──
print("\n=== DISTRIBUZIONE fatturabile ===")
for label, docs in [("GRTI", rti_gen), ("CRTI", rti_con), ("GRTIDF", rtidf_gen), ("CRTIDF", rtidf_con)]:
    c = Counter()
    for d in docs:
        f = d.get("fatturabile")
        if f is True: c["true"] += 1
        elif f is False: c["false"] += 1
        else: c["missing"] += 1
    print(f"  {label}: {dict(c)}")

# ── ESCLUSIONI ──
# Stati da escludere dagli alert (già fatturati)
RTI_STATI_ESCLUSI = {"rtidf_fatturato"}
RTIDF_STATI_ESCLUSI = {"fatturato"}

# Helper
def is_fatturabile(d):
    """fatturabile=true E non in stato fatturato"""
    if d.get("fatturabile") is False: return False  # esplicitamente non fatturabile
    # Se fatturabile è missing, assume True (default) — ma controlliamo quanti
    return True

# ── A3-G: GRTI 'definito' senza GRTIDF (ricalcolo) ──
print("\n=== A3-G: GRTI 'definito' senza GRTIDF (con filtri business) ===")
rtidf_gen_by_num = {str(d.get("numero_rti_origine","")): d for d in rtidf_gen}
rtidf_gen_by_id  = {str(d.get("rti_origine_id","")): d for d in rtidf_gen}

grti_definiti = [d for d in rti_gen if str(d.get("stato","")).lower() == "definito"]
print(f"GRTI totali stato=definito: {len(grti_definiti)}")

# Escludi già in stati "fatturato" (non dovrebbero essere in 'definito' ma controlliamo)
grti_def_not_fatt = [d for d in grti_definiti if str(d.get("stato","")).lower() not in RTI_STATI_ESCLUSI]
print(f"  escluso stati fatturati: {len(grti_def_not_fatt)}")

# Filtra fatturabile=true
grti_def_fatturabili = [d for d in grti_def_not_fatt if is_fatturabile(d)]
print(f"  con fatturabile != false: {len(grti_def_fatturabili)}")

# Quanti NON hanno RTIDF
grti_senza_rtidf_totale = 0
grti_senza_rtidf_fatturabili = 0
grti_senza_rtidf_non_fatt = 0
for d in grti_def_fatturabili:
    num = str(d.get("numero_rti",""))
    rid = str(d.get("_id",""))
    iid = str(d.get("id",""))
    if num in rtidf_gen_by_num: continue
    if rid in rtidf_gen_by_id: continue
    if iid and iid in rtidf_gen_by_id: continue
    grti_senza_rtidf_fatturabili += 1

# Conteggio completo (definito senza RTIDF, qualsiasi fatturabile)
for d in grti_def_not_fatt:
    num = str(d.get("numero_rti",""))
    rid = str(d.get("_id",""))
    iid = str(d.get("id",""))
    if num in rtidf_gen_by_num: continue
    if rid in rtidf_gen_by_id: continue
    if iid and iid in rtidf_gen_by_id: continue
    grti_senza_rtidf_totale += 1
    if d.get("fatturabile") is False:
        grti_senza_rtidf_non_fatt += 1

print(f"\n  GRTI definito senza GRTIDF (TOTALE): {grti_senza_rtidf_totale}")
print(f"  GRTI definito senza GRTIDF (fatturabili): {grti_senza_rtidf_fatturabili}")
print(f"  GRTI definito senza GRTIDF (non fatturabili — esclusi): {grti_senza_rtidf_non_fatt}")

# Stesso per CRTI
rtidf_con_by_num = {str(d.get("numero_rti_origine","")): d for d in rtidf_con}
rtidf_con_by_id  = {str(d.get("rti_origine_id","")): d for d in rtidf_con}
crti_definiti = [d for d in rti_con if str(d.get("stato","")).lower() == "definito"]
crti_senza_rtidf_fatturabili = 0
crti_senza_rtidf_totale = 0
crti_senza_rtidf_non_fatt = 0
for d in crti_definiti:
    if str(d.get("stato","")).lower() in RTI_STATI_ESCLUSI: continue
    num = str(d.get("numero_rti",""))
    rid = str(d.get("_id",""))
    iid = str(d.get("id",""))
    if num in rtidf_con_by_num: continue
    if rid in rtidf_con_by_id: continue
    if iid and iid in rtidf_con_by_id: continue
    crti_senza_rtidf_totale += 1
    if d.get("fatturabile") is False:
        crti_senza_rtidf_non_fatt += 1
    elif is_fatturabile(d):
        crti_senza_rtidf_fatturabili += 1
print(f"\n  CRTI definito senza CRTIDF (TOTALE): {crti_senza_rtidf_totale}")
print(f"  CRTI definito senza CRTIDF (fatturabili): {crti_senza_rtidf_fatturabili}")
print(f"  CRTI definito senza CRTIDF (non fatturabili): {crti_senza_rtidf_non_fatt}")

# ── A1-G: GRTIDF 'inviato' pronti fatturazione (con filtri) ──
print("\n=== A1-G: GRTIDF pronti fatturazione (esclusi fatturati) ===")
grtidf_inviati = [d for d in rtidf_gen if str(d.get("stato","")).lower() == "inviato"]
grtidf_inviati_non_fatt = [d for d in grtidf_inviati if str(d.get("stato","")).lower() not in RTIDF_STATI_ESCLUSI]
# Ulteriore filtro: fatturabile (inherited dal RTI origine)
grtidf_inviati_fatturabili = []
for d in grtidf_inviati_non_fatt:
    f = d.get("fatturabile")
    if f is False: continue
    grtidf_inviati_fatturabili.append(d)
val_eur = sum(d.get("costo_intervento",0) or 0 for d in grtidf_inviati_fatturabili)
print(f"GRTIDF inviati totali: {len(grtidf_inviati)}")
print(f"  con fatturabile != false: {len(grtidf_inviati_fatturabili)}")
print(f"  valore € pronti fatturazione: {val_eur}")

# Analogo CRTIDF (per completezza, anche se marginale)
crtidf_inviati = [d for d in rtidf_con if str(d.get("stato","")).lower() == "inviato"]
crtidf_inviati_fatturabili = [d for d in crtidf_inviati if d.get("fatturabile") is not False]
val_c = sum(d.get("costo_intervento",0) or 0 for d in crtidf_inviati_fatturabili)
print(f"CRTIDF inviati (info): {len(crtidf_inviati_fatturabili)} con valore {val_c} €")

# ── A2-G: GRTIDF senza costo_intervento (con filtri) ──
print("\n=== A2-G: GRTIDF senza costo_intervento (esclusi bozza+fatturato) ===")
# Escludi bozza e fatturato
grtidf_attivi = [d for d in rtidf_gen if str(d.get("stato","")).lower() not in ("bozza","fatturato")]
grtidf_senza_costo = [d for d in grtidf_attivi if not d.get("costo_intervento") or d.get("costo_intervento") == 0]
# Filtra fatturabile
grtidf_senza_costo_fatturabili = [d for d in grtidf_senza_costo if d.get("fatturabile") is not False]
print(f"GRTIDF senza costo (fatturabili, non fatturati, non bozza): {len(grtidf_senza_costo_fatturabili)}")

# NOTA: CRTIDF senza costo NON è alert (business rule) — non conteggiato

# ── A6: Bozze CRTI vecchie (resta valido come già calcolato) ──
print("\n=== A1-C: Bozze CRTI vecchie (resta valido) ===")
bozze_crti = [d for d in rti_con if str(d.get("stato","")).lower() == "bozza"]
bozze_vecchie_30 = []
for d in bozze_crti:
    dt = parse_date(d.get("data_intervento")) or parse_date(d.get("_lastModified"))
    if dt and days_ago(dt) > 30:
        bozze_vecchie_30.append(d)
print(f"CRTI bozze >30g (fatturabile irrilevante — sono ancora bozze): {len(bozze_vecchie_30)}")

# ── Tickets (esclusione non applicabile, sono aperti) ──
print("\n=== A4: Ticket aperti >30g (no cambio regole) ===")
# Info, non ricalcolo

# ── EXPORT ──
export = {
    "scan_at": NOW.isoformat(),
    "filtri_business_applicati": {
        "rti_stati_esclusi": list(RTI_STATI_ESCLUSI),
        "rtidf_stati_esclusi": list(RTIDF_STATI_ESCLUSI),
        "fatturabile_required": "fatturabile != false (true o missing=default true)",
    },
    "A1_G_grtidf_pronti_fattura": {
        "totali_inviati": len(grtidf_inviati),
        "post_filtro_fatturabile": len(grtidf_inviati_fatturabili),
        "valore_eur": val_eur,
    },
    "A2_G_grtidf_senza_costo": {
        "post_filtro_fatturabile_stato": len(grtidf_senza_costo_fatturabili),
        "note": "Esclusi bozza (naturale) + fatturato (già fatto) + fatturabile=false"
    },
    "A3_G_grti_senza_grtidf": {
        "totale_definiti_not_fatt": grti_senza_rtidf_totale,
        "post_filtro_fatturabile": grti_senza_rtidf_fatturabili,
        "esclusi_perche_non_fatturabili": grti_senza_rtidf_non_fatt,
    },
    "A3_C_crti_senza_crtidf": {
        "totale": crti_senza_rtidf_totale,
        "post_filtro_fatturabile": crti_senza_rtidf_fatturabili,
        "esclusi_non_fatturabili": crti_senza_rtidf_non_fatt,
    },
    "A1_C_bozze_crti_30g": {
        "totale_bozze": len(bozze_crti),
        "vecchie_30g": len(bozze_vecchie_30),
    },
    "removed_alerts": [
        "A2-C CRTIDF senza costo (business: normale per ripartizione millesimi)",
    ]
}

print("\n=== SOMMARIO FINALE ===")
print(json.dumps(export, indent=2, default=str))

with open("/home/albertocontardi/maestro-bridge/scripts/memo_filtri_business.json","w") as f:
    json.dump(export, f, indent=2, default=str)
print("\n✅ Export: scripts/memo_filtri_business.json")
