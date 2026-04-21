#!/usr/bin/env python3
"""memo_analisi_rti_rtidf.py — analisi reale dati Guazzotti TEC per PHARO.

Legge rti/rtidf/pending_rti/tickets, aggrega metriche sui DATI VERI
(non ipotesi), produce schema effettivo, relazioni, orfani, alert suggeriti.
"""
import sys, json
from datetime import datetime, timezone, timedelta
from collections import Counter, defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("pip install firebase-admin", file=sys.stderr); sys.exit(1)

PROJECT = "guazzotti-tec"
SAMPLE = 20
SCAN_LIMIT = 700

cred = credentials.ApplicationDefault()
try:
    firebase_admin.initialize_app(cred, {"projectId": PROJECT})
except ValueError:
    pass  # already initialized
db = firestore.client()

NOW = datetime.now(timezone.utc)

def parse_date(v):
    if v is None: return None
    try:
        if hasattr(v, "to_datetime"): return v.to_datetime()
        if hasattr(v, "timestamp"): return v
        if isinstance(v, datetime): return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        s = str(v).strip()
        if not s: return None
        # ISO
        for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ","%Y-%m-%dT%H:%M:%SZ","%Y-%m-%dT%H:%M:%S","%Y-%m-%d"):
            try:
                d = datetime.strptime(s.split("+")[0][:len(fmt)+8], fmt)
                return d.replace(tzinfo=timezone.utc)
            except Exception: pass
        # DD/MM/YYYY
        if "/" in s:
            parts = s.split("/")[:3]
            if len(parts) == 3:
                d = datetime(int(parts[2][:4]), int(parts[1]), int(parts[0]), tzinfo=timezone.utc)
                return d
    except Exception: pass
    return None

def days_ago(d):
    if not d: return None
    return (NOW - d).days

def field_summary(docs, max_examples=2):
    """Returns {field: {present:int, empty:int, types:Counter, samples:[]}}"""
    out = defaultdict(lambda: {"present":0, "empty":0, "types": Counter(), "samples":[]})
    for d in docs:
        for k, v in (d or {}).items():
            row = out[k]
            row["present"] += 1
            if v is None or v == "" or (isinstance(v, list) and not v) or (isinstance(v, dict) and not v):
                row["empty"] += 1
            row["types"][type(v).__name__] += 1
            if len(row["samples"]) < max_examples and v not in (None, ""):
                if isinstance(v, str) and len(v) > 80:
                    row["samples"].append(v[:80] + "…")
                elif isinstance(v, (dict, list)):
                    row["samples"].append(f"<{type(v).__name__} len={len(v)}>")
                else:
                    row["samples"].append(v)
    return out

def scan(collection):
    docs = []
    try:
        snap = db.collection(collection).limit(SCAN_LIMIT).stream()
        for d in snap:
            data = d.to_dict() or {}
            data["_id"] = d.id
            docs.append(data)
    except Exception as e:
        print(f"ERRORE lettura {collection}: {e}", file=sys.stderr)
    return docs

print(f"# MEMO Analisi RTI/RTIDF Guazzotti TEC")
print(f"# Scansione: {NOW.isoformat()}")
print(f"# Project: {PROJECT}")
print()

print("→ Leggo rti…")
rti_all = scan("rti")
print(f"   {len(rti_all)} documenti")
print("→ Leggo rtidf…")
rtidf_all = scan("rtidf")
print(f"   {len(rtidf_all)} documenti")
print("→ Leggo pending_rti…")
pending_all = scan("pending_rti")
print(f"   {len(pending_all)} documenti")
print("→ Leggo tickets…")
tickets_all = scan("tickets")
print(f"   {len(tickets_all)} documenti")

# ─── RTI ANALISI ────────────────────────────────────────────────

print("\n### RTI")
rti_stati = Counter(str(d.get("stato","?")).lower() for d in rti_all)
rti_tipi  = Counter(str(d.get("tipo","?")).lower() for d in rti_all)
print("Stati:", dict(rti_stati.most_common()))
print("Tipi:", dict(rti_tipi.most_common()))

rti_schema = field_summary(rti_all[:SAMPLE])
print(f"Campi nei primi {SAMPLE} docs: {len(rti_schema)}")

# Campi importanti vuoti
CAMPI_IMPORTANTI_RTI = ["tecnico_intervento","tecnico","ore_lavorate","materiali","materiale_utilizzato",
                         "intervento_effettuato","intervento_richiesto","cliente","numero_rti","data_intervento",
                         "fatturabile","numero_ticket","numero_ticket_collegato","ticket_collegato","costo_intervento"]
campi_vuoti = {}
for k in CAMPI_IMPORTANTI_RTI:
    cnt_vuoto = 0
    cnt_assente = 0
    for d in rti_all:
        v = d.get(k)
        if k not in d:
            cnt_assente += 1
        elif v is None or v == "" or (isinstance(v, list) and not v):
            cnt_vuoto += 1
    campi_vuoti[k] = {"vuoto": cnt_vuoto, "assente": cnt_assente, "totale": len(rti_all)}
print("Campi importanti vuoti/assenti:", json.dumps(campi_vuoti, indent=2))

# Bozze vecchie
bozze_vecchie = []
for d in rti_all:
    stato = str(d.get("stato","")).lower()
    if stato != "bozza": continue
    data = parse_date(d.get("data_intervento")) or parse_date(d.get("_lastModified")) or parse_date(d.get("created_at")) or parse_date(d.get("timestamp"))
    if data:
        age = days_ago(data)
        bozze_vecchie.append((d.get("numero_rti") or d["_id"], age, d.get("tecnico_intervento") or d.get("tecnico")))
bozze_vecchie.sort(key=lambda x: -(x[1] or 0))
print(f"Bozze totali: {len([d for d in rti_all if str(d.get('stato','')).lower()=='bozza'])}")
print(f"Top 5 bozze più vecchie:", bozze_vecchie[:5])
print(f"Bozze >7g: {sum(1 for _,a,_ in bozze_vecchie if a and a > 7)}")
print(f"Bozze >30g: {sum(1 for _,a,_ in bozze_vecchie if a and a > 30)}")
print(f"Bozze >90g: {sum(1 for _,a,_ in bozze_vecchie if a and a > 90)}")

# Link RTI → RTIDF
rtidf_by_numero_origine = {}
rtidf_by_id_origine = {}
for d in rtidf_all:
    no = d.get("numero_rti_origine")
    if no: rtidf_by_numero_origine[str(no)] = d
    rid = d.get("rti_origine_id")
    if rid: rtidf_by_id_origine[str(rid)] = d

rti_senza_rtidf_definito = 0
rti_senza_rtidf_definito_vecchi_7g = 0
for d in rti_all:
    stato = str(d.get("stato","")).lower()
    if stato != "definito": continue
    ha = (str(d.get("numero_rti","")) in rtidf_by_numero_origine) or (str(d.get("id","")) in rtidf_by_id_origine) or (str(d.get("_id","")) in rtidf_by_id_origine)
    if not ha:
        rti_senza_rtidf_definito += 1
        data = parse_date(d.get("data_intervento")) or parse_date(d.get("_lastModified"))
        if data and days_ago(data) > 7:
            rti_senza_rtidf_definito_vecchi_7g += 1
print(f"RTI 'definito' senza RTIDF: {rti_senza_rtidf_definito}")
print(f"RTI 'definito' senza RTIDF da >7g: {rti_senza_rtidf_definito_vecchi_7g}")

# ─── RTIDF ANALISI ─────────────────────────────────────────────

print("\n### RTIDF")
rtidf_stati = Counter(str(d.get("stato","?")).lower() for d in rtidf_all)
rtidf_tipi  = Counter(str(d.get("tipo","?")).lower() for d in rtidf_all)
print("Stati:", dict(rtidf_stati.most_common()))
print("Tipi:", dict(rtidf_tipi.most_common()))

rtidf_schema = field_summary(rtidf_all[:SAMPLE])
print(f"Campi nei primi {SAMPLE} docs: {len(rtidf_schema)}")

# RTIDF orfani (senza RTI)
rti_by_numero = {str(d.get("numero_rti")): d for d in rti_all if d.get("numero_rti")}
rti_by_id = {str(d.get("_id")): d for d in rti_all}
rtidf_orfani = 0
rtidf_orfani_samples = []
for d in rtidf_all:
    no_ori = str(d.get("numero_rti_origine") or "")
    id_ori = str(d.get("rti_origine_id") or "")
    ha = (no_ori and no_ori in rti_by_numero) or (id_ori and id_ori in rti_by_id)
    if not ha:
        rtidf_orfani += 1
        if len(rtidf_orfani_samples) < 5:
            rtidf_orfani_samples.append(d.get("numero_rtidf") or d["_id"])
print(f"RTIDF orfani (RTI sorgente non trovato nella stessa scan): {rtidf_orfani}")
print(f"  esempi: {rtidf_orfani_samples}")

# RTIDF inviati non fatturati
rtidf_inviati_non_fatt = 0
for d in rtidf_all:
    if str(d.get("stato","")).lower() == "inviato":
        rtidf_inviati_non_fatt += 1
print(f"RTIDF 'inviato' (candidati pronti per fatturazione): {rtidf_inviati_non_fatt}")

# Campi contabilizzazione
rtidf_costo_vuoto = sum(1 for d in rtidf_all if not d.get("costo_intervento"))
print(f"RTIDF senza costo_intervento: {rtidf_costo_vuoto}")

# ─── PENDING_RTI ────────────────────────────────────────────────

print("\n### PENDING_RTI")
pending_stati = Counter(str(d.get("stato","?")).lower() for d in pending_all)
print("Stati:", dict(pending_stati.most_common()))

pending_non_processed = [d for d in pending_all if str(d.get("stato","")).lower() != "processed"]
print(f"Pending NON processed: {len(pending_non_processed)}")

pending_vecchi = []
for d in pending_non_processed:
    created = parse_date(d.get("created_at")) or parse_date(d.get("data_invio"))
    if created:
        age = days_ago(created)
        pending_vecchi.append((d.get("_id"), age, d.get("titolo_card") or "?"))
pending_vecchi.sort(key=lambda x: -(x[1] or 0))
print(f"Pending (non processed) >7g: {sum(1 for _,a,_ in pending_vecchi if a and a>7)}")
print(f"Pending (non processed) >3g: {sum(1 for _,a,_ in pending_vecchi if a and a>3)}")
print(f"Top 5 più vecchi:", pending_vecchi[:5])

# Ticket collegato
pending_con_ticket = sum(1 for d in pending_non_processed if d.get("numero_ticket"))
print(f"Pending non processed con ticket: {pending_con_ticket}/{len(pending_non_processed)}")

# ─── TICKETS ─────────────────────────────────────────────────────

print("\n### TICKETS")
tickets_stati = Counter(str(d.get("stato","?")).lower() for d in tickets_all)
print("Stati:", dict(tickets_stati.most_common()))

# Aperti
aperti_states = {"aperto","pianificato","in_attesa","da_chiudere"}
tickets_aperti = [d for d in tickets_all if str(d.get("stato","")).lower() in aperti_states]
print(f"Tickets aperti/pianificati/in_attesa: {len(tickets_aperti)}")

# Chiusi senza RTI
chiusi_no_rti = 0
for d in tickets_all:
    stato = str(d.get("stato","")).lower()
    if "chius" in stato:
        if not d.get("rti_inviato") and not d.get("rtiChiusura"):
            chiusi_no_rti += 1
print(f"Tickets chiusi senza RTI collegato: {chiusi_no_rti}")

# Aperti vecchi
aperti_vecchi_14 = 0
aperti_vecchi_30 = 0
aperti_senza_rti = 0
for d in tickets_aperti:
    apertura = parse_date(d.get("data_apertura")) or parse_date(d.get("timestamp"))
    age = days_ago(apertura) if apertura else None
    if age and age > 14: aperti_vecchi_14 += 1
    if age and age > 30: aperti_vecchi_30 += 1
    if not d.get("rti_inviato") and not d.get("rtiChiusura"): aperti_senza_rti += 1
print(f"Aperti >14g: {aperti_vecchi_14}")
print(f"Aperti >30g: {aperti_vecchi_30}")
print(f"Aperti senza RTI: {aperti_senza_rti}")

# Tempo medio apertura → chiusura
durate = []
for d in tickets_all:
    stato = str(d.get("stato","")).lower()
    if "chius" not in stato: continue
    apr = parse_date(d.get("data_apertura")) or parse_date(d.get("timestamp"))
    chi = parse_date(d.get("data_chiusura"))
    if apr and chi:
        delta = (chi - apr).days
        if 0 <= delta < 1000:
            durate.append(delta)
if durate:
    avg = sum(durate)/len(durate)
    median = sorted(durate)[len(durate)//2]
    print(f"Tempo apertura→chiusura (n={len(durate)}): media={avg:.1f}g, mediana={median}g, max={max(durate)}g")
else:
    print("Durate ticket: nessuna calcolabile")

# ─── EXPORT JSON per documento ──────────────────────────────────

export = {
    "scan_at": NOW.isoformat(),
    "totals": {
        "rti": len(rti_all), "rtidf": len(rtidf_all),
        "pending_rti": len(pending_all), "tickets": len(tickets_all),
    },
    "rti": {
        "stati": dict(rti_stati),
        "tipi": dict(rti_tipi),
        "campi_importanti_vuoti": campi_vuoti,
        "bozze_totali": len([d for d in rti_all if str(d.get('stato','')).lower()=='bozza']),
        "bozze_7g": sum(1 for _,a,_ in bozze_vecchie if a and a > 7),
        "bozze_30g": sum(1 for _,a,_ in bozze_vecchie if a and a > 30),
        "bozze_90g": sum(1 for _,a,_ in bozze_vecchie if a and a > 90),
        "bozze_top5_piu_vecchie": [(str(n), a, t) for n,a,t in bozze_vecchie[:5]],
        "rti_definito_senza_rtidf": rti_senza_rtidf_definito,
        "rti_definito_senza_rtidf_7g": rti_senza_rtidf_definito_vecchi_7g,
        "schema": {k: {"present": v["present"], "empty": v["empty"], "types": dict(v["types"]), "samples": [str(s) for s in v["samples"]]} for k,v in rti_schema.items()},
    },
    "rtidf": {
        "stati": dict(rtidf_stati),
        "tipi": dict(rtidf_tipi),
        "orfani_count": rtidf_orfani,
        "orfani_samples": [str(s) for s in rtidf_orfani_samples],
        "inviati_pronti_fatturazione": rtidf_inviati_non_fatt,
        "senza_costo_intervento": rtidf_costo_vuoto,
        "schema": {k: {"present": v["present"], "empty": v["empty"], "types": dict(v["types"]), "samples": [str(s) for s in v["samples"]]} for k,v in rtidf_schema.items()},
    },
    "pending_rti": {
        "stati": dict(pending_stati),
        "non_processed": len(pending_non_processed),
        "vecchi_7g": sum(1 for _,a,_ in pending_vecchi if a and a > 7),
        "vecchi_3g": sum(1 for _,a,_ in pending_vecchi if a and a > 3),
        "con_ticket": pending_con_ticket,
    },
    "tickets": {
        "stati": dict(tickets_stati),
        "aperti": len(tickets_aperti),
        "aperti_senza_rti": aperti_senza_rti,
        "aperti_14g": aperti_vecchi_14,
        "aperti_30g": aperti_vecchi_30,
        "chiusi_senza_rti": chiusi_no_rti,
        "durata_media_giorni": (sum(durate)/len(durate)) if durate else None,
        "durata_mediana_giorni": (sorted(durate)[len(durate)//2]) if durate else None,
        "durata_max_giorni": max(durate) if durate else None,
    },
}

OUT_PATH = "/home/albertocontardi/maestro-bridge/scripts/memo_analisi_rti_rtidf.json"
with open(OUT_PATH, "w") as f:
    json.dump(export, f, indent=2, default=str)
print(f"\n✅ Export JSON: {OUT_PATH}")
