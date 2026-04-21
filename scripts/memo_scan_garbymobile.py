#!/usr/bin/env python3
"""memo_scan_garbymobile.py — scansione completa Firestore garbymobile-f89ac.

Elenca tutte le root collections, conta docs, estrae schema campi (20 samples),
salva risultati in JSON + markdown per MEMO.
"""
import sys, json
from collections import Counter
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit(1)

PROJECT = "garbymobile-f89ac"

cred = credentials.ApplicationDefault()
try:
    firebase_admin.initialize_app(cred, {"projectId": PROJECT})
except ValueError:
    pass
db = firestore.client()
NOW = datetime.now(timezone.utc).isoformat()

def pii_mask(v):
    """Mask stringhe che sembrano email/CF/telefoni"""
    if not isinstance(v, str): return v
    if "@" in v and "." in v: return "***@***"
    if len(v) == 16 and v.isalnum(): return "***CF***"  # codice fiscale
    return v

def field_stats(docs, sample_limit=25):
    """Returns {field: {present, empty, types, sample}}"""
    out = {}
    for d in docs[:sample_limit]:
        for k, v in (d or {}).items():
            if k not in out:
                out[k] = {"present": 0, "empty": 0, "types": Counter(), "sample": None}
            out[k]["present"] += 1
            if v is None or v == "" or (isinstance(v, list) and not v) or (isinstance(v, dict) and not v):
                out[k]["empty"] += 1
            tname = type(v).__name__
            out[k]["types"][tname] += 1
            if out[k]["sample"] is None and v not in (None, ""):
                if isinstance(v, str) and len(v) > 120:
                    out[k]["sample"] = v[:120] + "…"
                elif isinstance(v, (list, dict)):
                    out[k]["sample"] = f"<{tname} len={len(v)}>"
                else:
                    out[k]["sample"] = pii_mask(v) if isinstance(v, str) else v
    # Serializzabile
    return {k: {
        "present": v["present"], "empty": v["empty"],
        "types": dict(v["types"]),
        "sample": str(v["sample"])[:200] if v["sample"] is not None else None,
    } for k, v in out.items()}

# ── Lista top-level collections
print("→ Lista collection…")
cols = [c.id for c in db.collections()]
print(f"Totali: {len(cols)}")
for c in sorted(cols): print(f"  · {c}")

# ── Scan ogni collection
print("\n→ Scan schema…")
scan = {}
for col_name in cols:
    try:
        # Count totale (stream con cap)
        stream = db.collection(col_name).limit(2000).stream()
        docs = []
        for d in stream:
            docs.append({"_id": d.id, **(d.to_dict() or {})})
        cnt = len(docs)
        schema = field_stats(docs, sample_limit=25)
        # Sample document
        sample_doc = None
        if docs:
            sd = {k: v for k, v in docs[0].items() if k != "_id"}
            # Mask + tronca
            for k, v in list(sd.items()):
                if isinstance(v, str) and len(v) > 200:
                    sd[k] = v[:200] + "…"
                elif isinstance(v, (dict, list)):
                    sd[k] = f"<{type(v).__name__} len={len(v)}>"
                elif isinstance(v, str):
                    sd[k] = pii_mask(v)
            sample_doc = {"_id": docs[0].get("_id"), **sd}
        scan[col_name] = {
            "count": cnt,
            "count_is_exact": cnt < 2000,
            "field_count": len(schema),
            "schema": schema,
            "sample": sample_doc,
        }
        print(f"  ✓ {col_name}: {cnt}{'+' if cnt>=2000 else ''} docs, {len(schema)} campi")
    except Exception as e:
        scan[col_name] = {"error": str(e)[:200]}
        print(f"  ✗ {col_name}: {str(e)[:100]}")

# ── Ricerca mirata: "rubrica" contatti interni
print("\n→ Ricerca rubrica contatti interni…")
# Candidati: qualsiasi collection con campi tipo 'cellulare', 'interno', 'tel_interno', 'rubrica'
rubrica_candidates = []
for col, info in scan.items():
    if "error" in info: continue
    fields = set(info.get("schema", {}).keys())
    # Heuristics: contiene campi che suggeriscono contatti/rubrica
    score = 0
    hints = []
    for f in ["interno", "tel_interno", "cellulare", "cell_personale", "cell_lavoro", "telefono_personale", "telefono_lavoro", "categoria_contatto", "azienda"]:
        if f in fields:
            score += 1
            hints.append(f)
    if score >= 2:
        rubrica_candidates.append((col, score, hints))
rubrica_candidates.sort(key=lambda x: -x[1])
print(f"Candidati rubrica: {rubrica_candidates[:5]}")

# ── Export
OUT_JSON = "/home/albertocontardi/maestro-bridge/scripts/memo_scan_garbymobile.json"
with open(OUT_JSON, "w") as f:
    json.dump({
        "project": PROJECT,
        "scan_at": NOW,
        "total_collections": len(cols),
        "collections": sorted(cols),
        "schemas": scan,
        "rubrica_candidates": [{"collection": c, "score": s, "hints": h} for c,s,h in rubrica_candidates],
    }, f, indent=2, default=str)
print(f"\n✅ JSON: {OUT_JSON}")
