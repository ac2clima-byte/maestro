# Regole MAESTRO — Progetto maestro-bridge (NEXO)

## Modalità operativa
- Sei in AUTO MODE. Non chiedere MAI conferme, approvazioni, o "vuoi che proceda?"
- Non fare domande all'utente — l'utente non è davanti al terminale
- I task arrivano da MAESTRO via GitHub nella cartella tasks/
- Esegui il task dall'inizio alla fine senza interruzioni
- Se hai dubbi, scegli l'opzione più sicura e vai avanti
- Se un'operazione è rischiosa (scrittura su produzione), usa DRY_RUN=true di default
- Committa e pusha sempre dopo aver completato un task
- Se il push fallisce, fai git add -A && git stash && git pull --rebase origin main && git stash pop && git push

## Visibilità output
- Ogni volta che crei un file HTML, APRILO nel browser: cmd.exe /c start <percorso-file>
- Ogni volta che fai un test con risultati, mostra i risultati in una PAGINA HTML e aprila
- MAI salvare risultati solo su disco senza mostrarli visivamente ad Alberto

## Contesto NEXO — Cosa è e come funziona
NEXO è una piattaforma AI multi-agente per ACG Clima Service (HVAC, Alessandria/Voghera).
Ha 11 Colleghi AI che lavorano insieme via una Lavagna (bus Firestore).
NEXUS è la chat dove Alberto parla e i Colleghi rispondono.

### Firebase
- Project NEXO: nexo-hub-15f2d (Blaze, europe-west1)
- Project ACG/COSMINA: garbymobile-f89ac
- Project Guazzotti: guazzotti-tec (o guazzotti-energia)
- PWA: https://nexo-hub-15f2d.web.app

### Architettura Cloud Functions
- index.js: router principale, import handler modulari
- handlers/: 19 file JS, uno per Collega + shared.js + preventivo.js
- Ogni handler va nel SUO file — NON aggiungere codice a index.js
- Shared utilities in handlers/shared.js

### I Colleghi (tutti operativi via NEXUS Chat)
- IRIS: email (classificazione Haiku, polling, regole)
- ECHO: comunicazione (WhatsApp via Waha su Hetzner 178.104.88.86, rubrica da COSMINA)
- ARES: interventi (lettura da COSMINA bacheca_cards, scrittura dry-run)
- CHRONOS: pianificazione (campagne, agende, scadenze)
- MEMO: memoria (dossier clienti, mappa Firestore, contesto in context/memo-*.md)
- CHARTA: amministrazione (dati reali da Guazzotti TEC pagamenti_clienti)
- EMPORION: magazzino
- DIKEA: compliance (CURIT, F-Gas, PEC)
- DELPHI: analisi (KPI cross-source)
- PHARO: monitoring (dashboard RTI, alert, heartbeat)
- CALLIOPE: content (bozze con Claude Sonnet, workflow preventivo)

### PWA Modulare
- index.html: ~134 righe (solo shell)
- css/main.css: stili (design system DOC ACG Suite)
- js/app.js + moduli separati per chat, voce, sidebar, colleghi
- Stile: DM Sans, JetBrains Mono, palette ACG blue #006eb7

## Regole NEXUS Chat — FONDAMENTALI
1. LINGUAGGIO NATURALE: NEXUS risponde SEMPRE come un collega che parla
   - VIETATO: emoji, **bold**, bullet point (· o -), formato "campo: valore"
   - OBBLIGATORIO: frasi complete come se parlassi a voce
   - La funzione naturalize() in shared.js rimuove formattazione post-Haiku
2. Voce: edge-tts, voce femminile it-IT-ElsaNeural
3. Microfono: conversazione continua (continuous=true)
4. DRY_RUN: attivo di default per WhatsApp e scritture su COSMINA

## Credenziali e Auth
- Login PWA: Firebase Auth su garbymobile-f89ac (cross-project)
- Credenziali EWS: nei file .env (projects/iris/.env o /mnt/c/HERMES/.env)
- Per testare la PWA con Playwright: cerca le credenziali nei .env del progetto
- API key Anthropic: in Secret Manager o .env

## Test con Playwright
- Usa Playwright per testare la PWA dopo ogni modifica
- Login → apri NEXUS Chat → scrivi domanda → aspetta risposta → screenshot
- Analizza gli screenshot e scrivi risultato testuale
- Se qualcosa è rotto, fixa e ritesta

## Workflow Preventivo
- IRIS riconosce intent "preparare_preventivo" → Orchestratore → CALLIOPE genera → Alberto approva
- handlers/preventivo.js: 500+ righe, workflow completo
- Collection: calliope_bozze, charta_preventivi, memo_aziende

## Dev Requests
- File tasks/dev-request-*.md: NON eseguire come task normale
- Analizza il problema, scrivi analisi in tasks/dev-analysis-*.md
- NON implementare, solo analisi e proposta

## File di contesto MEMO (leggili quando serve)
- context/memo-firestore-garbymobile.md: schema COSMINA
- context/memo-guazzotti-tec-map.md: schema Guazzotti TEC
- context/memo-analisi-rti-rtidf.md: analisi RTI generico vs contabilizzazione
- context/memo-campagne-cosmina.md: struttura campagne
- context/memo-cloud-functions.md: lista Cloud Functions
- context/memo-acg-suite-mappa.md: mappa app Suite

## Tecnici ACG (anagrafica corretta)

I tecnici ACG sono nove. Lista corretta (cognome — nome):
- Aime David
- Albanesi Gianluca
- Contardi Alberto
- Dellafiore Lorenzo
- Dellafiore Victor
- Leshi Ergest      ← NON "Berberi Ergest", quello è dato sporco in COSMINA
- Piparo Marco
- Tosca Federico
- Troise Antonio

NB: in `cosmina_contatti_interni` (garbymobile-f89ac) il doc
`X2SnZIpQmlPGibcgMzx9` ha `nome: "BERBERI ERGEST"` — è un errore di
import, da correggere manualmente da console Firebase a "LESHI ERGEST".
Stiven Berberi è una persona diversa (categoria "ufficio"), non va
toccato.

## Regole generali
- Lingua: italiano
- Se una collection Firestore non esiste, stampalo e vai avanti
- Se un'API non è raggiungibile, stampalo e vai avanti
- Mantieni codice MODULARE: 1 file per handler, niente monoliti
