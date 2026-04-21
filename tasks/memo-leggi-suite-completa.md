MEMO deve diventare l'esperto dell'intera ACG Suite. Leggi, capisci, memorizza.

FASE 1 — Leggi il codice sorgente

1. Leggi ~/acg_suite/CLAUDE.md — il file principale che descrive tutta la Suite
2. Mappa la struttura delle cartelle:
   find ~/acg_suite/ -maxdepth 3 -type f \( -name "*.js" -o -name "*.html" -o -name "*.json" -o -name "*.py" \) | head -200
3. Per OGNI app della Suite (COSMINA, DOC, GRAPH, KANT, READER, Guazzotti TEC, GarbyMobile, CosminaMobile):
   - Leggi il file principale (index.html o main.js)
   - Leggi il package.json o firebase.json
   - Identifica: quali collection Firestore usa, quali API chiama, quali Cloud Functions ha
   - Identifica: relazioni con le altre app (cross-references, link, API condivise)

FASE 2 — Mappa TUTTI i Firestore

1. Progetto garbymobile-f89ac (ACG): lista tutte le collection, schema di ognuna, documenti esempio
2. Progetto guazzotti-energia (Guazzotti TEC): lista tutte le collection, schema di ognuna
3. Progetto nexo-hub-15f2d (NEXO): lista tutte le collection

Per ogni collection: nome, numero documenti stimato, campi con tipi, relazioni con altre collection.

FASE 3 — Mappa le Cloud Functions

1. Lista tutte le Cloud Functions deployate su garbymobile-f89ac:
   firebase functions:list --project garbymobile-f89ac 2>/dev/null || echo "lista manuale"
2. Per ogni funzione: nome, trigger (HTTP/Firestore/scheduled), cosa fa
3. Cerca nel codice: grep -r "onRequest\|onCall\|onDocumentCreated\|onSchedule" ~/acg_suite/ | head -50

FASE 4 — Salva tutto

Crea questi file di contesto:

context/memo-acg-suite-mappa.md:
- Panoramica: lista app con descrizione di una riga
- Per ogni app: stack, URL, collection usate, Cloud Functions, relazioni
- Grafo delle relazioni tra app

context/memo-firestore-garbymobile.md:
- Tutte le collection del progetto ACG con schema dettagliato

context/memo-firestore-guazzotti.md:
- Tutte le collection del progetto Guazzotti con schema dettagliato

context/memo-cloud-functions.md:
- Lista completa Cloud Functions con trigger e descrizione

context/memo-ultimo-aggiornamento.md:
- Timestamp dell'ultima scansione
- Hash dei file principali (per sapere se qualcosa è cambiato)
- Cosa è cambiato rispetto alla scansione precedente (se esiste)

FASE 5 — Cache in Firestore

Salva un riassunto in nexo-hub Firestore:
- memo_dossier/acg_suite_overview
- memo_dossier/firestore_garbymobile_schema
- memo_dossier/firestore_guazzotti_schema
- memo_dossier/cloud_functions_map

Così NEXUS e gli altri Colleghi possono leggere il contesto senza che MEMO debba riscansionare ogni volta.

NOTA: questa scansione va rifatta periodicamente (settimanale o quando Alberto dice "memo aggiornati"). Per ora fai la prima scansione completa.

Committa con "feat(memo): scansione completa ACG Suite + Firestore + Cloud Functions"
