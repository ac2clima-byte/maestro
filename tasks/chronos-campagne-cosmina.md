Implementa la dashboard campagne in CHRONOS con dati reali da COSMINA.

## 1. MEMO — Trova la struttura dati delle campagne

Cerca in COSMINA Firestore (garbymobile-f89ac) dove stanno i dati delle campagne:

python3 -c "
import firebase_admin, json
from firebase_admin import firestore
app = firebase_admin.initialize_app(options={'projectId': 'garbymobile-f89ac'})
db = firestore.client(app)

# Cerca collection campagne
for c in db.collections():
    if any(k in c.id.lower() for k in ['campagn', 'campaign', 'walkby', 'lettur']):
        print(f'TROVATA: {c.id}')
        docs = c.limit(3).get()
        for d in docs:
            print(json.dumps(d.to_dict(), default=str, indent=2)[:1000])

# Cerca anche in bacheca_cards o interventi pianificati
for coll_name in ['bacheca_cards', 'cosmina_interventi_pianificati', 'cosmina_campagne', 'campagne']:
    try:
        docs = db.collection(coll_name).limit(1).get()
        for d in docs:
            data = d.to_dict()
            if 'campagna' in str(data).lower() or 'walkby' in str(data).lower():
                print(f'TROVATA IN: {coll_name}')
                print(json.dumps(data, default=str, indent=2)[:1000])
    except:
        pass
"

Cerca specificamente la campagna 'Letture WalkBy ACG FS 2026':
- Dove sono i 97 interventi?
- Come si distingue completato/programmato/scaduto/da programmare?
- Qual è il campo che indica l'appartenenza alla campagna?

Salva la struttura trovata in context/memo-campagne-cosmina.md

## 2. CHRONOS — Handler campagne nel nexusRouter

In handlers/chronos.js aggiungi:

handleChronosCampagne(query):
- Leggi da COSMINA la campagna richiesta
- Calcola le metriche:
  * Totale interventi della campagna
  * Completati (stato chiuso/completato)
  * Programmati (con data futura o oggi)
  * Scaduti (data superata ma non completati)
  * Da Programmare (senza data)
  * Non Fatti (segnalati come non fatto)
  * Da Non Fare (segnalati da non fare)
- Ritorna i numeri formattati

handleChronosListaCampagne():
- Lista tutte le campagne attive con stato sintetico

Aggiungi al routing NEXUS: "come va la campagna [nome]?", "campagne attive", "stato campagna walkby"

## 3. PWA — Sezione campagne nella pagina CHRONOS

Nella pagina CHRONOS della PWA aggiungi:
- Lista campagne attive (da Cloud Function, non da Firestore diretto)
- Per ogni campagna: card con i 7 indicatori (totale, completati, programmati, scaduti, da programmare, non fatti, da non fare)
- Barra progresso colorata: verde (completati), blu (programmati), giallo (da programmare), rosso (scaduti)
- Click su una campagna → dettaglio con lista interventi

## 4. Testa

- NEXUS: "come va la campagna Letture WalkBy?"
- NEXUS: "campagne attive"
- PWA: pagina CHRONOS con dashboard campagne
- Screenshot + analisi

## 5. Deploy functions + hosting
## 6. Committa con "feat(chronos): dashboard campagne reali da COSMINA"
