Implementa SOLO apriIntervento e interventiAperti per ARES. Due azioni, funzionanti.

STEP ESATTI:

1. Scopri la struttura delle collection COSMINA per gli interventi:
   - Leggi ~/acg_suite/CLAUDE.md
   - Se non basta, connettiti a Firestore acg-clima-service e lista le collection:
     python3 -c "
     import firebase_admin
     from firebase_admin import credentials, firestore
     app = firebase_admin.initialize_app(options={'projectId': 'garbymobile-f89ac'})
     db = firestore.client()
     for c in db.collections():
         print(c.id)
     " 2>&1 | head -30

   - Poi leggi un documento esempio dalla collection interventi:
     python3 -c "
     import firebase_admin, json
     from firebase_admin import credentials, firestore
     app = firebase_admin.initialize_app(options={'projectId': 'garbymobile-f89ac'})
     db = firestore.client()
     docs = db.collection('cosmina_interventi_pianificati').limit(1).get()
     for d in docs:
         print(json.dumps(d.to_dict(), default=str, indent=2))
     " 2>&1

2. Una volta capita la struttura, implementa apriIntervento che crea un documento nella collection corretta

3. Implementa interventiAperti che legge gli interventi aperti

4. Aggiorna la Cloud Function nexusRouter per gestire "interventi aperti" e "apri intervento"

5. Testa con Playwright: NEXUS chat "interventi aperti" → deve rispondere con dati reali

6. Rideploya
7. Committa con "feat(ares): apriIntervento + interventiAperti su COSMINA"
