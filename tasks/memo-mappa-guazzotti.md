MEMO deve esplorare e mappare la struttura Firestore di Guazzotti TEC (progetto guazzotti-energia).

Questo è il lavoro di MEMO: conoscere tutti i database, tutte le collection, tutti i campi. Gli altri Colleghi chiederanno a MEMO quando hanno bisogno di sapere dove trovare i dati.

STEP:

1. Connettiti a Firestore progetto guazzotti-energia (come fai per garbymobile-f89ac)

2. Lista TUTTE le collection:
   python3 -c "
   import firebase_admin, json
   from firebase_admin import firestore
   app = firebase_admin.initialize_app(options={'projectId': 'guazzotti-energia'}, name='guazzotti')
   db = firestore.client(app)
   for c in db.collections():
       count = len(list(c.limit(5).get()))
       print(f'{c.id}: {count}+ documenti')
   "

3. Per OGNI collection, leggi 2 documenti di esempio e mappa la struttura dei campi:
   - Nome collection
   - Campi con tipo (string, number, timestamp, array, map)
   - Esempio di documento (con dati reali ma senza PII sensibili)
   - Relazioni con altre collection (campi che sembrano ID/reference)

4. Focus speciale su:
   - Collection RTI (rti, rtidf, o simili) — struttura completa
   - Collection interventi/tickets
   - Collection contabilizzazione
   - Collection clienti/condomini

5. Salva TUTTO in context/memo-guazzotti-tec-map.md con:
   - Lista collection con conteggio documenti
   - Schema di ogni collection
   - Esempio documento per ogni collection
   - Grafo relazioni tra collection
   - Note su cosa sembra essere ogni collection

6. Salva anche in Firestore nexo-hub: memo_dossier/guazzotti_tec_schema come cache

7. Stampa a console un riassunto delle collection più importanti

8. Committa con "feat(memo): mappa struttura Guazzotti TEC Firestore"
