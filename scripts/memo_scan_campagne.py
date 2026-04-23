#!/usr/bin/env python3
"""Scan collection campagne COSMINA + identifica struttura interventi per campagna."""
import sys, json
from collections import Counter
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.ApplicationDefault()
try: firebase_admin.initialize_app(cred, {"projectId": "garbymobile-f89ac"})
except ValueError: pass
db = firestore.client()

def short(v, n=120):
    if v is None: return None
    if isinstance(v, (dict, list)): return f"<{type(v).__name__} len={len(v)}>"
    s = str(v)
    return s[:n] + ("…" if len(s) > n else "")

# ─── 1. Collection campagne ────────────────────────────────────
print("═══ COLLECTION CAMPAGNE ═══")
campagne_cols = []
for c in db.collections():
    if any(k in c.id.lower() for k in ["campagn", "campaign", "walkby", "lettur"]):
        campagne_cols.append(c.id)
        snap = c.limit(5).get()
        docs = list(snap)
        print(f"\n── {c.id} ({len(docs)} sample) ──")
        for d in docs:
            data = d.to_dict() or {}
            print(f"  ID: {d.id}")
            for k in sorted(data.keys())[:25]:
                print(f"    {k}: {short(data[k])}")
            print()

# ─── 2. Bacheca cards: campi campagna? ──────────────────────────
print("\n═══ BACHECA_CARDS con campagna ═══")
snap = db.collection("bacheca_cards").limit(300).get()
campagna_stats = Counter()
walkby_docs = []
campagne_nomi = Counter()
for d in snap:
    v = d.to_dict() or {}
    c_nome = v.get("campagna_nome") or v.get("campagna") or v.get("campagnaNome")
    c_id = v.get("campagna_id") or v.get("campagnaId")
    if c_nome or c_id:
        campagna_stats["con_campagna"] += 1
        if c_nome: campagne_nomi[str(c_nome)] += 1
    if c_nome and "walkby" in str(c_nome).lower():
        walkby_docs.append({"id": d.id, **v})
    # Heuristics "walkby" nel testo
    bag = str(v.get("boardName", "")) + " " + str(v.get("name", "")) + " " + str(v.get("desc", ""))[:200]
    if "walkby" in bag.lower() or "walk-by" in bag.lower():
        campagna_stats["walkby_mentioned"] += 1

print(f"  docs con campagna: {campagna_stats}")
print(f"  campagne trovate (per nome):")
for n, c in campagne_nomi.most_common(20):
    print(f"    · {n}: {c}")

# ─── 3. Focus Walkby (scan tutti i 2000 bacheca) ────────────────
print("\n═══ WALKBY — scan tutti bacheca_cards ═══")
all_snap = db.collection("bacheca_cards").limit(2500).get()
walkby = []
per_stato = Counter()
per_listname = Counter()
campo_campagna_piu_usato = Counter()

for d in all_snap:
    v = d.to_dict() or {}
    c_nome = v.get("campagna_nome")
    if c_nome and "walkby" in str(c_nome).lower() and "2026" in str(c_nome):
        walkby.append({"_id": d.id, **v})
        per_stato[str(v.get("stato", "?"))] += 1
        per_listname[str(v.get("listName", "?"))] += 1

print(f"  Totale walkby 2026: {len(walkby)}")
print(f"  Per stato: {dict(per_stato)}")
print(f"  Per listName: {dict(per_listname)}")

if walkby:
    print("\n  Sample walkby (primo doc, campi principali):")
    w = walkby[0]
    for k in sorted(w.keys()):
        if k.startswith("_") and k != "_id": continue
        print(f"    {k}: {short(w[k])}")

# ─── 4. Campo due/date per sort ────────────────────────────────
print("\n═══ DATE SU WALKBY ═══")
now = datetime.now()
has_due = 0
due_futuro = 0
due_scaduto = 0
no_due = 0
for w in walkby:
    due = w.get("due")
    if due:
        has_due += 1
        try:
            dt = due.to_datetime() if hasattr(due, "to_datetime") else datetime.fromisoformat(str(due).replace("Z", "+00:00"))
            dt_naive = dt.replace(tzinfo=None) if dt.tzinfo else dt
            if dt_naive < now: due_scaduto += 1
            else: due_futuro += 1
        except Exception:
            pass
    else:
        no_due += 1
print(f"  has_due={has_due} (futuro={due_futuro}, scaduto={due_scaduto}) · no_due={no_due}")

# ─── 5. Labels/customFields ─────────────────────────────────────
print("\n═══ LABELS su walkby (primi 100) ═══")
labels_counter = Counter()
custom_fields = Counter()
for w in walkby[:100]:
    for lbl in (w.get("labels") or []):
        if isinstance(lbl, dict):
            labels_counter[str(lbl.get("name", "?"))] += 1
        else:
            labels_counter[str(lbl)] += 1
    for cf in (w.get("customFieldItems") or []):
        if isinstance(cf, dict):
            val = cf.get("value") or cf.get("name") or "?"
            custom_fields[str(val)[:40]] += 1
print(f"  Labels top 15:")
for l, c in labels_counter.most_common(15):
    print(f"    · {l}: {c}")
print(f"  CustomFields top 10:")
for l, c in custom_fields.most_common(10):
    print(f"    · {l}: {c}")

# ─── 6. Export ──────────────────────────────────────────────────
export = {
    "collezioni_campagne": campagne_cols,
    "campagne_nomi": dict(campagne_nomi.most_common()),
    "walkby_2026": {
        "totale": len(walkby),
        "per_stato": dict(per_stato),
        "per_listName": dict(per_listname),
        "has_due": has_due,
        "due_futuro": due_futuro,
        "due_scaduto": due_scaduto,
        "no_due": no_due,
        "labels_top": dict(labels_counter.most_common(20)),
        "customFields_top": dict(custom_fields.most_common(20)),
    },
    "sample_walkby_doc": walkby[0] if walkby else None,
}

with open("/home/albertocontardi/maestro-bridge/scripts/memo_scan_campagne.json", "w") as f:
    json.dump(export, f, indent=2, default=str)
print(f"\n✅ Export: scripts/memo_scan_campagne.json")
