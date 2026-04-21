# Sprint 3 — Integrazioni colleghi rimanenti

PREREQUISITO: Sprint 1 completato (MEMO ha mappato tutto COSMINA)

## Task 3.1: CHRONOS — Scadenze e agende reali
1. Dalla mappa MEMO (context/memo-firestore-garbymobile.md), trova:
   - Il campo scadenza manutenzione in cosmina_impianti (prossima_scadenza? scadenza_manutenzione?)
   - La collection interventi pianificati per le agende tecnici
   - La collection campagne se esiste
2. Implementa scadenzeProssime con query reale su COSMINA
3. Implementa agendaGiornaliera: leggi interventi pianificati per tecnico e data
4. Implementa slotDisponibili: calcola slot liberi basandosi sugli interventi già pianificati
5. Aggiorna handler NEXUS per CHRONOS
6. Aggiorna dashboard CHRONOS nella PWA: mostra calendario con scadenze e interventi
7. Testa: "scadenze prossime", "agenda di Malvicino domani", "slot liberi questa settimana"
8. Committa con "feat(chronos): scadenze e agende reali da COSMINA"

## Task 3.2: CHARTA — Dati contabili reali
1. Dalla mappa MEMO, trova:
   - pagamenti_clienti su Guazzotti TEC (già mappato: 100+ docs con esposizione creditoria)
   - pagamenti_snapshots su Guazzotti TEC (9 snapshot storici mensili)
   - Collection fatture su COSMINA se esiste
2. Implementa esposizioneCliente: leggi da pagamenti_clienti di Guazzotti TEC
3. Implementa scadenzeFatture: dalle email IRIS (FATTURA_FORNITORE) + pagamenti_clienti
4. Implementa estraiIncassiDaEmail: parsing base del corpo email per "incassi"
   - Cerca pattern: importi EUR (€, euro), nomi clienti, riferimenti fattura
   - Per v0.1 basta estrarre gli importi come testo strutturato
5. Implementa reportMensile con dati reali da pagamenti_clienti + pagamenti_snapshots
6. Aggiorna handler NEXUS per CHARTA
7. Aggiorna dashboard CHARTA: mostra esposizione top clienti + fatture recenti
8. Testa: "esposizione cliente Kristal", "fatture scadute", "incassi di oggi"
9. Committa con "feat(charta): dati contabili reali da Guazzotti TEC"

## Task 3.3: EMPORION — Magazzino reale
1. Dalla mappa MEMO (context/memo-firestore-garbymobile.md), trova:
   - magazzino, magazzino_giacenze, magazzino_movimenti, magazzino_listini su COSMINA
   - catalogoArticoli su Guazzotti TEC (1 doc "default")
   - Se le collection non esistono su COSMINA, verifica se i dati sono su Magazzino Pro (Flask/PythonAnywhere)
2. Implementa disponibilita: cerca articolo per codice o descrizione
3. Implementa articoliSottoScorta: articoli con giacenza < scorta minima
4. Se nessuna collection magazzino esiste in Firestore:
   - Crea una collection base emporion_articoli in nexo-hub con schema
   - Spiega che va collegato a Magazzino Pro in futuro
5. Aggiorna handler NEXUS per EMPORION
6. Testa: "c'è il pezzo valvola a sfera?", "cosa manca in magazzino?"
7. Committa con "feat(emporion): magazzino reale da COSMINA"

## Task 3.4: DIKEA — Scadenze normative reali
1. Dalla mappa MEMO, trova:
   - cosmina_impianti_cit: schema campi CIT/CURIT (REE, bollino, targa)
   - Nomi esatti dei campi scadenza
2. Implementa scadenzeCURIT: query cosmina_impianti_cit per scadenze nei prossimi 90 giorni
3. Implementa impiantiSenzaTarga: impianti che dovrebbero avere targa CURIT ma non ce l'hanno
4. Implementa checkFGas: cerca campo F-Gas o certificazione in cosmina_impianti
5. Aggiorna handler NEXUS per DIKEA
6. Testa: "scadenze CURIT", "impianti senza targa", "impianti con F-Gas in scadenza"
7. Committa con "feat(dikea): scadenze normative reali da COSMINA"

## Task 3.5: Orchestratore — Workflow guasto urgente
Implementa ALMENO il workflow guasto_urgente end-to-end:

1. Il flusso:
   - IRIS classifica email come GUASTO_URGENTE
   - Regola IRIS scrive su Lavagna to="orchestrator" tipo="guasto_urgente"
   - Orchestratore riceve, avvia workflow:
     Step 1: MEMO → dossierCliente (chi è il cliente?)
     Step 2: ARES → apriIntervento (dry-run)
     Step 3: ECHO → sendWhatsApp ad Alberto ("Guasto urgente: [dettagli]")
   
2. Implementa il listener dell'Orchestratore:
   - Cloud Function onDocumentCreated su nexo_lavagna dove to="orchestrator"
   - Leggi il tipo di messaggio
   - Se "guasto_urgente": avvia il workflow definito sopra
   - Scrivi log in nexo_orchestrator_log

3. Implementa almeno il tracking base:
   - Crea FlowInstance in nexo_orchestrator_log
   - Per ogni step: registra inizio, fine, risultato
   - Se un step fallisce: logga errore, vai allo step successivo

4. Testa: crea un messaggio di test sulla Lavagna con tipo guasto_urgente e verifica che il workflow scatti

5. Committa con "feat(orchestrator): workflow guasto_urgente end-to-end"
