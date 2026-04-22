Completa TUTTO quello che manca in NEXO. Lavora in sequenza senza fermarti. Mantieni il codice MODULARE (1 file per Collega in handlers/).

REGOLA: ogni handler va nel suo file handlers/{collega}.js. NON aggiungere codice a index.js se non gli export. Shared utilities in handlers/shared.js.

## 1. POLLING IRIS 24/7 — Verifica e attiva

Verifica se irisPoller/irisPollScheduled funzionano:
- firebase functions:log --only irisPoller --project nexo-hub-15f2d | tail -20
- Se non funzionano (exchangelib non disponibile in Cloud Functions):
  - Usa ews-javascript-api (pacchetto npm) al posto di exchangelib
  - Oppure usa node-ews
  - Implementa in handlers/iris-poller.js
- Verifica che le credenziali EWS siano in Secret Manager o in Firestore
- Se funziona: invoca manualmente irisPollerRun e controlla nuove email in iris_emails
- Committa con "feat(iris): polling 24/7 verificato"

## 2. REGOLE IRIS — Test end-to-end

- Verifica che le 4 regole predefinite esistano in iris_rules (se no: seed con seed_rules.py)
- Verifica che irisRuleEngine (trigger onDocumentCreated) funzioni:
  - Crea documento test in iris_emails con categoria GUASTO_URGENTE
  - Controlla se scrive sulla Lavagna
- Se non funziona, fixa
- Committa con "test(iris): regole automatiche verificate"

## 3. CALLIOPE — Cerca email automaticamente

In handlers/calliope.js:
- Quando l'utente chiede "scrivi risposta a Moraschi":
  - Cerca automaticamente in iris_emails l'ultima email dove sender contiene "moraschi"
  - Usa il contesto (oggetto, corpo, categoria) per generare la bozza con Sonnet
  - NON chiedere l'ID email
- Quando l'utente chiede "scrivi bozza preventivo per Kristal":
  - Cerca dossier Kristal via MEMO handler
  - Genera preventivo contestualizzato
- Template: crea 3 documenti in calliope_template (risposta standard, sollecito, comunicazione condominio)
- Committa con "feat(calliope): bozze con contesto automatico da IRIS"

## 4. NEXUS — Contesto conversazionale

In handlers/nexus.js:
- Prima di chiamare Haiku, carica gli ultimi 5 messaggi della sessione da nexus_chat
- Includili nel prompt come conversation history
- Così NEXUS capisce riferimenti: "dimmi tutto su Kristal" → "quanti interventi hanno avuto?" → capisce che "hanno" = Kristal
- Committa con "feat(nexus): contesto conversazionale multi-turno"

## 5. ECHO — Digest mattutino

Crea handlers/echo-digest.js:
- Cloud Function schedulata echoDigestMattutino: ogni giorno alle 07:30 CET
- Raccoglie da: IRIS (email notte), ARES (interventi oggi), PHARO (alert), CHRONOS (scadenze)
- Genera testo breve: "Buongiorno. Stanotte 3 email (1 urgente). Oggi 4 interventi. 1 alert PHARO."
- Manda WA ad Alberto (usa handler ECHO sendWhatsApp)
- Configurabile: flag in Firestore cosmina_config/echo_config.digest_enabled (default true)
- Export da index.js
- Committa con "feat(echo): digest mattutino via WA"

## 6. ECHO — Ricezione WA in entrata

Crea handlers/echo-inbound.js:
- Cloud Function HTTP: echoInboundWebhook
- Waha manda POST quando arriva messaggio WA
- Identifica mittente (numero → rubrica COSMINA)
- Salva in echo_messages con direction="inbound"
- Se mittente = Alberto: interpreta come comando NEXUS (chiama nexusRouter internamente)
- Se mittente = tecnico: salva e notifica Alberto
- Se mittente = cliente: salva e notifica Alberto
- Export da index.js
- Committa con "feat(echo): ricezione WA in entrata"

## 7. ORCHESTRATORE — Workflow guasto urgente

Crea handlers/orchestrator.js:
- Cloud Function onDocumentCreated su nexo_lavagna dove to="orchestrator"
- Workflow guasto_urgente:
  Step 1: leggi dettagli dal messaggio Lavagna
  Step 2: MEMO cerca dossier cliente
  Step 3: ARES apre intervento (dry-run)
  Step 4: ECHO manda WA ad Alberto ("Guasto urgente: [dettagli]")
- Log in nexo_orchestrator_log con tracking: inizio, step, fine, risultato
- Export da index.js
- Committa con "feat(orchestrator): workflow guasto urgente end-to-end"

## 8. PHARO — Alert RTI fix definitivo

In handlers/pharo.js:
- handlePharoRtiMonitoring deve:
  - Filtrare fatturabile=true (escludi non fatturabili)
  - Escludere stati rtidf_fatturato e fatturato
  - Separare generico (GRTI/GRTIDF) da contabilizzazione (CRTI/CRTIDF)
  - CRTIDF senza costo_intervento NON è un alert
  - Ricalcolare valore economico bloccato solo sui fatturabili
- pharoCheckRti (scheduler ogni 6h): se trova alert critical → scrivi Lavagna per ECHO
- Committa con "fix(pharo): alert RTI senza falsi positivi"

## 9. CHRONOS — Scadenze reali da COSMINA

In handlers/chronos.js:
- Leggi context/memo-firestore-garbymobile.md per trovare il campo scadenza
- Implementa scadenzeProssime con query reale
- Implementa agendaGiornaliera: interventi pianificati per tecnico e data
- Se i campi non corrispondono, logga e vai avanti
- Committa con "feat(chronos): scadenze reali da COSMINA"

## 10. DIKEA — Scadenze CURIT reali

In handlers/dikea.js:
- Leggi context/memo-firestore-garbymobile.md per i campi CIT/CURIT
- Implementa scadenzeCURIT con query reale su cosmina_impianti_cit
- Implementa impiantiSenzaTarga reale
- Committa con "feat(dikea): scadenze CURIT reali"

## 11. CHARTA — Dati contabili da Guazzotti TEC

In handlers/charta.js:
- Leggi pagamenti_clienti da Guazzotti TEC (già mappato da MEMO)
- Implementa esposizioneCliente reale
- Report mensile con dati da pagamenti_clienti + pagamenti_snapshots
- Committa con "feat(charta): dati contabili reali"

## 12. EMPORION — Magazzino

In handlers/emporion.js:
- Leggi context/memo-firestore-garbymobile.md per trovare collection magazzino
- Se esiste: implementa disponibilita e articoliSottoScorta reali
- Se non esiste: crea collection base emporion_articoli in nexo-hub con schema
- Committa con "feat(emporion): magazzino reale"

## 13. DELPHI — KPI cross-source

In handlers/delphi.js:
- Aggrega da: iris_emails + COSMINA interventi + Guazzotti pagamenti_clienti + rti/rtidf
- KPI: email volume, interventi aperti/chiusi, esposizione totale, RTI fatturabili bloccati, costo AI
- confrontoMeseSuMese con dati reali
- Committa con "feat(delphi): KPI cross-source reali"

## 14. Deploy + Test finale

- firebase deploy --only functions --project nexo-hub-15f2d
- firebase deploy --only hosting --project nexo-hub-15f2d
- Testa TUTTI i Colleghi via Playwright (1 domanda per Collega = 11 test + 3 test extra: digest, contesto multi-turno, workflow guasto)
- Screenshot + analisi testuale
- Report finale: results/v02-completamento.html
- Committa con "test(nexo): v0.2 completamento finale"
