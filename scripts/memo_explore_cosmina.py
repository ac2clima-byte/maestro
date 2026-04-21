#!/usr/bin/env python3
"""Esplora le collection COSMINA per capire schema e pattern MEMO."""
import sys, json
from collections import Counter

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit(1)

cred = credentials.ApplicationDefault()
try:
    firebase_admin.initialize_app(cred, {"projectId": "garbymobile-f89ac"})
except ValueError:
    pass
db = firestore.client()

# Cerca collection chiave
COLLECTIONS_TO_TRY = [
    "crm_clienti",
    "cosmina_clienti",
    "cosmina_impianti",
    "cosmina_interventi_pianificati",
    "cosmina_interventi",
    "interventi",
    "clienti",
    "impianti",
    "bacheca_cards",
    "anagrafiche",
    "condomini",
]

print("=== COLLECTION PROBE ===")
existing = {}
for col in COLLECTIONS_TO_TRY:
    try:
        snap = db.collection(col).limit(1).get()
        count_snap = db.collection(col).limit(3).get()
        count = len(list(count_snap))
        # Sample per schema
        sample = None
        for d in count_snap:
            sample = d.to_dict() or {}
            break
        if count > 0 or sample:
            # Probe sized: get 20 for stats
            probe = list(db.collection(col).limit(20).get())
            existing[col] = {
                "probe_size": len(probe),
                "sample_keys": sorted(sample.keys())[:30] if sample else [],
            }
            print(f"  ✓ {col}: {len(probe)} docs in probe, {len(sample.keys()) if sample else 0} campi")
        else:
            print(f"  · {col}: vuota o non esiste")
    except Exception as e:
        msg = str(e)
        if "PERMISSION" in msg.upper() or "DENIED" in msg.upper():
            print(f"  ✗ {col}: PERMISSION_DENIED")
        else:
            print(f"  ? {col}: {msg[:80]}")

# Scheming clienti/condomini
print("\n=== SCHEMA DETTAGLIATO: cosmina_clienti ===")
try:
    docs = list(db.collection("cosmina_clienti").limit(10).get())
    keys_counter = Counter()
    for d in docs:
        for k in d.to_dict().keys():
            keys_counter[k] += 1
    print(f"  {len(docs)} docs, campi (con count):")
    for k, c in keys_counter.most_common(30):
        print(f"    {k}: {c}")
    if docs:
        s = docs[0].to_dict()
        print("  Esempio:")
        for k, v in list(s.items())[:15]:
            if isinstance(v, str) and len(v) > 80: v = v[:80] + "…"
            print(f"    {k}: {v}")
except Exception as e:
    print(f"  Errore: {e}")

print("\n=== SCHEMA DETTAGLIATO: cosmina_impianti ===")
try:
    docs = list(db.collection("cosmina_impianti").limit(10).get())
    keys_counter = Counter()
    for d in docs:
        for k in d.to_dict().keys():
            keys_counter[k] += 1
    print(f"  {len(docs)} docs, campi:")
    for k, c in keys_counter.most_common(30):
        print(f"    {k}: {c}")
    if docs:
        s = docs[0].to_dict()
        print("  Esempio:")
        for k, v in list(s.items())[:15]:
            if isinstance(v, str) and len(v) > 80: v = v[:80] + "…"
            print(f"    {k}: {v}")
except Exception as e:
    print(f"  Errore: {e}")

print("\n=== SCHEMA DETTAGLIATO: cosmina_interventi_pianificati ===")
try:
    docs = list(db.collection("cosmina_interventi_pianificati").limit(10).get())
    keys_counter = Counter()
    for d in docs:
        for k in d.to_dict().keys():
            keys_counter[k] += 1
    print(f"  {len(docs)} docs, campi:")
    for k, c in keys_counter.most_common(30):
        print(f"    {k}: {c}")
    if docs:
        s = docs[0].to_dict()
        print("  Esempio:")
        for k, v in list(s.items())[:15]:
            if isinstance(v, str) and len(v) > 80: v = v[:80] + "…"
            print(f"    {k}: {v}")
except Exception as e:
    print(f"  Errore: {e}")

# Cerca "La Bussola" / "Kristal" / "Malvicino" / "Bussola"
QUERIES = ["bussola", "kristal", "malvicino"]
print("\n=== RICERCA FUZZY ===")
for col in ["cosmina_clienti", "cosmina_impianti"]:
    try:
        docs = list(db.collection(col).limit(500).get())
        print(f"\n--- {col} ({len(docs)} docs scansionati) ---")
        for q in QUERIES:
            matches = []
            for d in docs:
                data = d.to_dict() or {}
                bag = json.dumps(data, default=str).lower()
                if q in bag:
                    # Estrai chiavi significative
                    name = data.get("ragione_sociale") or data.get("nome") or data.get("cliente") or data.get("condominio") or data.get("denominazione") or data.get("ragioneSociale") or d.id
                    ind = data.get("indirizzo") or data.get("via") or ""
                    matches.append(f"{d.id}: {name} | {ind}")
            print(f"  '{q}': {len(matches)} match")
            for m in matches[:5]:
                print(f"    · {m}")
    except Exception as e:
        print(f"  {col}: errore {e}")
