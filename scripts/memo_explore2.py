#!/usr/bin/env python3
"""Esplora crm_clienti + bacheca_cards + cerca Bussola/Kristal/Malvicino"""
import sys, json
from collections import Counter

import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.ApplicationDefault()
try: firebase_admin.initialize_app(cred, {"projectId": "garbymobile-f89ac"})
except ValueError: pass
db = firestore.client()

# ── crm_clienti schema completo
print("=== crm_clienti ===")
docs = list(db.collection("crm_clienti").limit(20).get())
kc = Counter()
for d in docs:
    for k in d.to_dict().keys(): kc[k] += 1
print(f"  {len(docs)} sample, {len(kc)} campi unici")
for k, c in kc.most_common(30):
    print(f"  {k}: {c}")
print("\nEsempio completo:")
if docs:
    s = docs[0].to_dict()
    for k, v in sorted(s.items())[:40]:
        if isinstance(v, (dict, list)):
            v = f"<{type(v).__name__} len={len(v)}>"
        elif isinstance(v, str) and len(v) > 80:
            v = v[:80] + "…"
        print(f"  {k}: {v}")

# ── bacheca_cards
print("\n\n=== bacheca_cards ===")
docs = list(db.collection("bacheca_cards").limit(20).get())
kc = Counter()
for d in docs:
    for k in d.to_dict().keys(): kc[k] += 1
print(f"  {len(docs)} sample, {len(kc)} campi")
for k, c in kc.most_common(25):
    print(f"  {k}: {c}")
print("\nEsempio:")
if docs:
    s = docs[0].to_dict()
    for k, v in sorted(s.items())[:25]:
        if isinstance(v, (dict, list)):
            v = f"<{type(v).__name__} len={len(v)}>"
        elif isinstance(v, str) and len(v) > 80:
            v = v[:80] + "…"
        print(f"  {k}: {v}")

# listName uniche
print("\n  listName uniche:")
lists = Counter()
for d in docs:
    lists[(d.to_dict() or {}).get("listName", "?")] += 1
for k,c in lists.most_common(): print(f"    {k}: {c}")

# ── Fuzzy ricerca su crm_clienti
print("\n\n=== FUZZY crm_clienti (500 docs) ===")
docs = list(db.collection("crm_clienti").limit(500).get())
print(f"  {len(docs)} totali")

def bag_for(data):
    """Concatena tutti i campi stringa per fuzzy search"""
    parts = []
    for k, v in (data or {}).items():
        if isinstance(v, str):
            parts.append(v.lower())
        elif isinstance(v, (int, float)):
            parts.append(str(v).lower())
    return " ".join(parts)

QUERIES = ["bussola", "kristal", "malvicino"]
for q in QUERIES:
    matches = []
    for d in docs:
        data = d.to_dict() or {}
        if q in bag_for(data):
            matches.append((d.id, data))
    print(f"\n  '{q}': {len(matches)} match")
    for mid, m in matches[:5]:
        name = m.get("ragione_sociale") or m.get("denominazione") or m.get("nome") or m.get("cliente") or mid
        ind = m.get("indirizzo") or m.get("via") or ""
        comune = m.get("comune") or m.get("city") or ""
        print(f"    · {mid}: {name} | {ind} {comune}")
        # Mostra tutti i campi principali
        interesting = ["ragione_sociale","denominazione","nome","cognome","cliente","condominio","indirizzo","via","comune","provincia","cap","telefono","email","amministratore","codice"]
        for k in interesting:
            v = m.get(k)
            if v: print(f"        {k}: {str(v)[:80]}")

# ── Fuzzy su cosmina_impianti (scan fino a 500)
print("\n\n=== FUZZY cosmina_impianti (500 docs) ===")
docs = list(db.collection("cosmina_impianti").limit(500).get())
print(f"  {len(docs)} totali")
for q in QUERIES:
    matches = []
    for d in docs:
        data = d.to_dict() or {}
        if q in bag_for(data):
            matches.append((d.id, data))
    print(f"\n  '{q}': {len(matches)} match")
    for mid, m in matches[:5]:
        print(f"    · {mid}")
        interesting = ["codice","targa","indirizzo","occupante_cognome","occupante_nome","ditta_responsabile_cognome","combustibile","note","data_scadenza_dichiarazione","giorni_ritardo_manutenzione"]
        for k in interesting:
            v = m.get(k)
            if v: print(f"        {k}: {str(v)[:80]}")
