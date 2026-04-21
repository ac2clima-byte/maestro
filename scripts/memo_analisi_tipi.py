#!/usr/bin/env python3
"""memo_analisi_tipi.py — segmenta RTI/RTIDF per tipo generico vs contabilizzazione.

Produce schema, stati, orfani, campi mancanti separati per GRTI/CRTI e GRTIDF/CRTIDF.
"""
import sys, json
from datetime import datetime, timezone
from collections import Counter, defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("pip install firebase-admin", file=sys.stderr); sys.exit(1)

PROJECT = "guazzotti-tec"
SCAN_LIMIT = 700
SAMPLE = 30

cred = credentials.ApplicationDefault()
try:
    firebase_admin.initialize_app(cred, {"projectId": PROJECT})
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
            except Exception: pass
        if "/" in s:
            parts = s.split("/")[:3]
            if len(parts) == 3:
                return datetime(int(parts[2][:4]), int(parts[1]), int(parts[0]), tzinfo=timezone.utc)
    except Exception: pass
    return None

def days_ago(d):
    if not d: return None
    return (NOW - d).days

def scan(col):
    docs = []
    try:
        snap = db.collection(col).limit(SCAN_LIMIT).stream()
        for d in snap:
            data = d.to_dict() or {}
            data["_id"] = d.id
            docs.append(data)
    except Exception as e:
        print(f"ERR {col}: {e}", file=sys.stderr)
    return docs

def classify_tipo(doc, collection_type):
    """Classifica un doc come 'generico' o 'contabilizzazione' o '?'
    basandosi su campo tipo + prefisso numero.
    collection_type: 'rti' | 'rtidf'
    """
    tipo = str(doc.get("tipo","")).lower()
    if tipo in ("generico", "contabilizzazione"):
        return tipo
    # fallback via prefisso numero
    numero = doc.get("numero_rti") or doc.get("numero_rtidf") or doc.get("_id") or ""
    numero = str(numero).upper()
    if collection_type == "rti":
        if numero.startswith("GRTI"): return "generico"
        if numero.startswith("CRTI"): return "contabilizzazione"
    elif collection_type == "rtidf":
        if numero.startswith("GRTIDF"): return "generico"
        if numero.startswith("CRTIDF"): return "contabilizzazione"
    return "?"

def field_summary(docs, max_examples=2):
    out = defaultdict(lambda: {"present":0, "empty":0, "types": Counter(), "samples":[]})
    for d in docs:
        for k, v in (d or {}).items():
            row = out[k]
            row["present"] += 1
            if v is None or v == "" or (isinstance(v, list) and not v) or (isinstance(v, dict) and not v):
                row["empty"] += 1
            row["types"][type(v).__name__] += 1
            if len(row["samples"]) < max_examples and v not in (None, ""):
                if isinstance(v, str) and len(v) > 60:
                    row["samples"].append(v[:60] + "…")
                elif isinstance(v, (dict, list)):
                    row["samples"].append(f"<{type(v).__name__} len={len(v)}>")
                else:
                    row["samples"].append(v)
    return out

# ─── LOAD ──────────────────────────────────────────────────────

print("→ Carico rti + rtidf…")
rti_all = scan("rti")
rtidf_all = scan("rtidf")
print(f"  rti: {len(rti_all)}  rtidf: {len(rtidf_all)}")

# Segmenta
rti_gen = [d for d in rti_all if classify_tipo(d, "rti") == "generico"]
rti_con = [d for d in rti_all if classify_tipo(d, "rti") == "contabilizzazione"]
rti_unk = [d for d in rti_all if classify_tipo(d, "rti") == "?"]

rtidf_gen = [d for d in rtidf_all if classify_tipo(d, "rtidf") == "generico"]
rtidf_con = [d for d in rtidf_all if classify_tipo(d, "rtidf") == "contabilizzazione"]
rtidf_unk = [d for d in rtidf_all if classify_tipo(d, "rtidf") == "?"]

print(f"\n=== SEGMENTAZIONE ===")
print(f"RTI:   GRTI={len(rti_gen)}  CRTI={len(rti_con)}  UNK={len(rti_unk)}")
print(f"RTIDF: GRTIDF={len(rtidf_gen)}  CRTIDF={len(rtidf_con)}  UNK={len(rtidf_unk)}")

# ─── COMPARE CAMPI ─────────────────────────────────────────────

def campi_set(docs):
    s = set()
    for d in docs:
        for k in d.keys():
            if k != "_id": s.add(k)
    return s

rti_gen_fields = campi_set(rti_gen)
rti_con_fields = campi_set(rti_con)
rtidf_gen_fields = campi_set(rtidf_gen)
rtidf_con_fields = campi_set(rtidf_con)

print(f"\n=== CAMPI RTI ===")
print(f"Solo GRTI: {sorted(rti_gen_fields - rti_con_fields)}")
print(f"Solo CRTI: {sorted(rti_con_fields - rti_gen_fields)}")
print(f"Comuni: {len(rti_gen_fields & rti_con_fields)} campi")

print(f"\n=== CAMPI RTIDF ===")
print(f"Solo GRTIDF: {sorted(rtidf_gen_fields - rtidf_con_fields)}")
print(f"Solo CRTIDF: {sorted(rtidf_con_fields - rtidf_gen_fields)}")
print(f"Comuni: {len(rtidf_gen_fields & rtidf_con_fields)} campi")

# ─── STATI PER TIPO ────────────────────────────────────────────

def stati(docs):
    return dict(Counter(str(d.get("stato","?")).lower() for d in docs).most_common())

print(f"\n=== STATI RTI ===")
print(f"GRTI: {stati(rti_gen)}")
print(f"CRTI: {stati(rti_con)}")

print(f"\n=== STATI RTIDF ===")
print(f"GRTIDF: {stati(rtidf_gen)}")
print(f"CRTIDF: {stati(rtidf_con)}")

# ─── ORFANI PER TIPO ───────────────────────────────────────────

def build_indices(rti_list):
    by_num = {str(d.get("numero_rti","")): d for d in rti_list if d.get("numero_rti")}
    by_id  = {str(d.get("_id","")): d for d in rti_list}
    by_id_secondary = {str(d.get("id","")): d for d in rti_list if d.get("id")}
    return by_num, by_id, by_id_secondary

def rti_senza_rtidf(rti_list, rtidf_list):
    rtidf_by_num_ori = {str(d.get("numero_rti_origine","")): d for d in rtidf_list}
    rtidf_by_id_ori  = {str(d.get("rti_origine_id","")): d for d in rtidf_list}
    out = []
    for d in rti_list:
        if str(d.get("stato","")).lower() != "definito": continue
        num = str(d.get("numero_rti",""))
        rid = str(d.get("_id",""))
        iid = str(d.get("id",""))
        if num in rtidf_by_num_ori: continue
        if rid in rtidf_by_id_ori: continue
        if iid and iid in rtidf_by_id_ori: continue
        out.append(d)
    return out

def rtidf_orfani(rti_list, rtidf_list):
    by_num, by_id, by_id2 = build_indices(rti_list)
    out = []
    for d in rtidf_list:
        no = str(d.get("numero_rti_origine","") or "")
        ri = str(d.get("rti_origine_id","") or "")
        if no and no in by_num: continue
        if ri and (ri in by_id or ri in by_id2): continue
        out.append(d)
    return out

# Qui la domanda chiave: un GRTI può originare un CRTIDF? Teoricamente no.
# Matching è indipendente dal tipo — testiamo cross-match.
grti_sec_grtidf = rti_senza_rtidf(rti_gen, rtidf_gen)
crti_sec_crtidf = rti_senza_rtidf(rti_con, rtidf_con)
grti_sec_rtidf_any = rti_senza_rtidf(rti_gen, rtidf_all)  # match su qualsiasi rtidf
crti_sec_rtidf_any = rti_senza_rtidf(rti_con, rtidf_all)

print(f"\n=== ORFANI / MATCH ===")
print(f"GRTI definiti senza GRTIDF: {len(grti_sec_grtidf)}")
print(f"GRTI definiti senza alcun RTIDF (anche CRTIDF): {len(grti_sec_rtidf_any)}")
print(f"CRTI definiti senza CRTIDF: {len(crti_sec_crtidf)}")
print(f"CRTI definiti senza alcun RTIDF: {len(crti_sec_rtidf_any)}")

grtidf_orf = rtidf_orfani(rti_gen, rtidf_gen)
crtidf_orf = rtidf_orfani(rti_con, rtidf_con)
grtidf_orf_any = rtidf_orfani(rti_all, rtidf_gen)
crtidf_orf_any = rtidf_orfani(rti_all, rtidf_con)
print(f"GRTIDF senza GRTI sorgente: {len(grtidf_orf)}")
print(f"GRTIDF senza alcun RTI sorgente: {len(grtidf_orf_any)}")
print(f"CRTIDF senza CRTI sorgente: {len(crtidf_orf)}")
print(f"CRTIDF senza alcun RTI sorgente: {len(crtidf_orf_any)}")

# Verifica: ci sono match cross-tipo? (GRTI→CRTIDF o viceversa)
cross_gen_to_con = 0
cross_con_to_gen = 0
rti_gen_nums = {str(d.get("numero_rti","")) for d in rti_gen}
rti_con_nums = {str(d.get("numero_rti","")) for d in rti_con}
for d in rtidf_all:
    tipo = classify_tipo(d, "rtidf")
    origin = str(d.get("numero_rti_origine",""))
    if tipo == "contabilizzazione" and origin in rti_gen_nums: cross_gen_to_con += 1
    if tipo == "generico" and origin in rti_con_nums: cross_con_to_gen += 1
print(f"Cross-tipo GRTI→CRTIDF: {cross_gen_to_con}")
print(f"Cross-tipo CRTI→GRTIDF: {cross_con_to_gen}")

# ─── COSTI / FATTURAZIONE PER TIPO ─────────────────────────────

def count_costo(docs):
    with_cost = 0
    without = 0
    total_cost = 0
    for d in docs:
        c = d.get("costo_intervento")
        if isinstance(c, (int, float)) and c > 0:
            with_cost += 1
            total_cost += c
        else:
            without += 1
    return with_cost, without, total_cost

gc_with, gc_without, gc_total = count_costo(rtidf_gen)
cc_with, cc_without, cc_total = count_costo(rtidf_con)
print(f"\n=== COSTI RTIDF ===")
print(f"GRTIDF con costo>0: {gc_with} ({gc_total} EUR), senza costo: {gc_without}")
print(f"CRTIDF con costo>0: {cc_with} ({cc_total} EUR), senza costo: {cc_without}")

# RTIDF inviati per tipo
grtidf_inv = [d for d in rtidf_gen if str(d.get("stato","")).lower() == "inviato"]
crtidf_inv = [d for d in rtidf_con if str(d.get("stato","")).lower() == "inviato"]
grtidf_inv_cost = sum(d.get("costo_intervento",0) or 0 for d in grtidf_inv)
crtidf_inv_cost = sum(d.get("costo_intervento",0) or 0 for d in crtidf_inv)
print(f"GRTIDF 'inviato': {len(grtidf_inv)} docs, valore {grtidf_inv_cost} EUR")
print(f"CRTIDF 'inviato': {len(crtidf_inv)} docs, valore {crtidf_inv_cost} EUR")

# ─── BOZZE PER TIPO ────────────────────────────────────────────

def bozze(docs):
    out = []
    for d in docs:
        if str(d.get("stato","")).lower() != "bozza": continue
        dt = parse_date(d.get("data_intervento")) or parse_date(d.get("_lastModified"))
        age = days_ago(dt) if dt else None
        out.append((d.get("numero_rti") or d["_id"], age, d.get("tecnico_intervento","?")))
    out.sort(key=lambda x: -(x[1] or 0))
    return out

b_gen = bozze(rti_gen)
b_con = bozze(rti_con)
print(f"\n=== BOZZE ===")
print(f"GRTI bozze: {len(b_gen)} (>7g: {sum(1 for _,a,_ in b_gen if a and a>7)}, >30g: {sum(1 for _,a,_ in b_gen if a and a>30)})")
print(f"  top 5: {b_gen[:5]}")
print(f"CRTI bozze: {len(b_con)} (>7g: {sum(1 for _,a,_ in b_con if a and a>7)}, >30g: {sum(1 for _,a,_ in b_con if a and a>30)})")
print(f"  top 5: {b_con[:5]}")

# ─── CAMPI DIFFERENTI per tipo (deep) ───────────────────────────

def field_coverage(docs):
    """% docs che hanno il campo non-vuoto"""
    if not docs: return {}
    totals = defaultdict(lambda: {"present":0, "empty":0})
    for d in docs:
        for k,v in d.items():
            totals[k]["present"] += 1
            if v is None or v == "" or (isinstance(v,list) and not v) or (isinstance(v,dict) and not v):
                totals[k]["empty"] += 1
    return {k: {"pres": v["present"], "empty": v["empty"], "coverage": (v["present"]-v["empty"])/len(docs)} for k,v in totals.items()}

rti_gen_cov = field_coverage(rti_gen)
rti_con_cov = field_coverage(rti_con)
rtidf_gen_cov = field_coverage(rtidf_gen)
rtidf_con_cov = field_coverage(rtidf_con)

# Trova campi con copertura sostanzialmente diversa
print(f"\n=== CAMPI CON COPERTURA DIVERSA (RTI: G vs C) ===")
all_keys = set(rti_gen_cov.keys()) | set(rti_con_cov.keys())
diff = []
for k in all_keys:
    g = rti_gen_cov.get(k, {"coverage":0})["coverage"]
    c = rti_con_cov.get(k, {"coverage":0})["coverage"]
    if abs(g - c) > 0.2:
        diff.append((k, g, c))
diff.sort(key=lambda x: -abs(x[1]-x[2]))
for k,g,c in diff[:20]:
    print(f"  {k}: GRTI={g:.0%}  CRTI={c:.0%}  delta={g-c:+.0%}")

print(f"\n=== CAMPI CON COPERTURA DIVERSA (RTIDF: G vs C) ===")
all_keys = set(rtidf_gen_cov.keys()) | set(rtidf_con_cov.keys())
diff2 = []
for k in all_keys:
    g = rtidf_gen_cov.get(k, {"coverage":0})["coverage"]
    c = rtidf_con_cov.get(k, {"coverage":0})["coverage"]
    if abs(g - c) > 0.2:
        diff2.append((k, g, c))
diff2.sort(key=lambda x: -abs(x[1]-x[2]))
for k,g,c in diff2[:20]:
    print(f"  {k}: GRTIDF={g:.0%}  CRTIDF={c:.0%}  delta={g-c:+.0%}")

# ─── CAMPI SPECIFICI CONTABILIZZAZIONE ─────────────────────────
# Cerco keyword "letture", "matricola", "misuratore", "ripartizione", "UNI10200", "millesim"
KW_CONTA = ["lettur","matricol","misurat","ripartiz","uni10200","millesim","consum","contator","m3","kwh","vol"]
print(f"\n=== CAMPI KEYWORD CONTABILIZZAZIONE ===")
found_in_crti = set()
found_in_crtidf = set()
for d in rti_con[:100]:
    for k in d.keys():
        if any(kw in k.lower() for kw in KW_CONTA): found_in_crti.add(k)
for d in rtidf_con[:100]:
    for k in d.keys():
        if any(kw in k.lower() for kw in KW_CONTA): found_in_crtidf.add(k)
print(f"CRTI campi contabilizzazione-specific: {sorted(found_in_crti)}")
print(f"CRTIDF campi contabilizzazione-specific: {sorted(found_in_crtidf)}")

# Check presenza di valori numerici tipo letture
print(f"\n=== ESEMPIO CRTI (sample) ===")
if rti_con:
    sample = rti_con[0]
    for k,v in sorted(sample.items()):
        if k in ("rtiPdfContent",): continue
        if isinstance(v, str) and len(v) > 80: v = v[:80]+"…"
        print(f"  {k}: {v}")

print(f"\n=== ESEMPIO CRTIDF (sample) ===")
if rtidf_con:
    sample = rtidf_con[0]
    for k,v in sorted(sample.items()):
        if k in ("rtiPdfContent",): continue
        if isinstance(v, str) and len(v) > 80: v = v[:80]+"…"
        print(f"  {k}: {v}")

# ─── EXPORT ────────────────────────────────────────────────────

export = {
    "scan_at": NOW.isoformat(),
    "totals": {
        "rti": {"total": len(rti_all), "generico": len(rti_gen), "contabilizzazione": len(rti_con), "?": len(rti_unk)},
        "rtidf": {"total": len(rtidf_all), "generico": len(rtidf_gen), "contabilizzazione": len(rtidf_con), "?": len(rtidf_unk)},
    },
    "stati": {
        "GRTI": stati(rti_gen),
        "CRTI": stati(rti_con),
        "GRTIDF": stati(rtidf_gen),
        "CRTIDF": stati(rtidf_con),
    },
    "campi": {
        "solo_GRTI": sorted(rti_gen_fields - rti_con_fields),
        "solo_CRTI": sorted(rti_con_fields - rti_gen_fields),
        "solo_GRTIDF": sorted(rtidf_gen_fields - rtidf_con_fields),
        "solo_CRTIDF": sorted(rtidf_con_fields - rtidf_gen_fields),
    },
    "campi_copertura_diversa_rti": [{"campo": k, "grti": round(g,3), "crti": round(c,3)} for k,g,c in diff[:30]],
    "campi_copertura_diversa_rtidf": [{"campo": k, "grtidf": round(g,3), "crtidf": round(c,3)} for k,g,c in diff2[:30]],
    "match": {
        "GRTI_definiti_senza_GRTIDF": len(grti_sec_grtidf),
        "CRTI_definiti_senza_CRTIDF": len(crti_sec_crtidf),
        "GRTIDF_orfani": len(grtidf_orf),
        "CRTIDF_orfani": len(crtidf_orf),
        "cross_GRTI_to_CRTIDF": cross_gen_to_con,
        "cross_CRTI_to_GRTIDF": cross_con_to_gen,
    },
    "costi": {
        "GRTIDF_con_costo": gc_with, "GRTIDF_senza_costo": gc_without, "GRTIDF_totale_eur": gc_total,
        "CRTIDF_con_costo": cc_with, "CRTIDF_senza_costo": cc_without, "CRTIDF_totale_eur": cc_total,
        "GRTIDF_inviati_count": len(grtidf_inv), "GRTIDF_inviati_eur": grtidf_inv_cost,
        "CRTIDF_inviati_count": len(crtidf_inv), "CRTIDF_inviati_eur": crtidf_inv_cost,
    },
    "bozze": {
        "GRTI_totali": len(b_gen), "GRTI_7g": sum(1 for _,a,_ in b_gen if a and a>7), "GRTI_30g": sum(1 for _,a,_ in b_gen if a and a>30),
        "GRTI_top5": [(str(n), a, str(t)) for n,a,t in b_gen[:5]],
        "CRTI_totali": len(b_con), "CRTI_7g": sum(1 for _,a,_ in b_con if a and a>7), "CRTI_30g": sum(1 for _,a,_ in b_con if a and a>30),
        "CRTI_top5": [(str(n), a, str(t)) for n,a,t in b_con[:5]],
    },
    "keyword_contabilizzazione": {
        "CRTI_campi": sorted(found_in_crti),
        "CRTIDF_campi": sorted(found_in_crtidf),
    },
}

OUT = "/home/albertocontardi/maestro-bridge/scripts/memo_analisi_tipi.json"
with open(OUT, "w") as f:
    json.dump(export, f, indent=2, default=str)
print(f"\n✅ Export: {OUT}")
