# IRIS — TODO v0.1

_Ultimo aggiornamento: 2026-04-17_

## Completato
- [x] Setup progetto (package.json, tsconfig, struttura cartelle)
- [x] Modulo email ingestion (EWS via exchangelib + wrapper TypeScript)
- [x] Classificatore email (Claude Haiku + prompt contestualizzato ACG Clima)
- [x] Schema Firestore (IrisEmailDoc, IrisCorrectionDoc)
- [x] API routes (GET emails, GET email/:id, POST correct, GET stats)
- [x] PWA dashboard con dati mock (login, lista email, filtri, modale correzione)
- [x] Test connessione EWS reale a remote.gruppobadano.it
- [x] Firebase project nexo-hub-15f2d configurato + web app registrata
- [x] Firebase config reale inlined nella PWA (CORS-safe da file://)
- [x] PWA deployata su Firebase Hosting (https://nexo-hub-15f2d.web.app)
- [x] Pipeline reale end-to-end: EWS → Haiku → Firestore → PWA (30 email live)
- [x] PWA legge da Firestore reale (collection `iris_emails`, fallback mock on error)
- [x] Firestore security rules v0.1 (read pubblico temporaneo, write solo admin SDK)
- [x] Modale "Leggi email" con corpo completo, monospace, ESC/click-fuori per chiudere
- [x] Cap letture EWS a 30 (env `EWS_MAX_RESULTS`, default pipeline 30)
- [x] **Lavagna** (`nexo-core/lavagna/`): bus inter-Colleghi in Firestore con stati, priorità, history
- [x] IRIS → Lavagna: post automatico su EFESTO per RICHIESTA_INTERVENTO / GUASTO_URGENTE
- [x] Redesign PWA: tema chiaro minimal (Gmail/Linear-like), mobile-first, badge categoria soft
- [x] **F1 Sentiment analysis**: 5 livelli (positivo/neutro/frustrato/arrabbiato/disperato) + badge con emoji
- [x] History git ripulita da secret (API key + password rimosse), push su origin/main

## Da fare — Auth & sicurezza (priorità alta)
- [ ] Ripristinare login nella PWA (MOCK_MODE=false) una volta configurato Firebase Auth
- [ ] Creare utente Alberto in Firebase Auth (password o Google SSO)
- [ ] Stringere Firestore rules: `allow read: if request.auth.uid == resource.data.userId`
- [ ] API key Anthropic dedicata per IRIS in Secret Manager (ruotata dopo leak)
- [ ] Credenziali EWS in Secret Manager (non più in `.env` locale)
- [ ] Certificate pinning per EWS (togliere `NoVerifyHTTPAdapter`)
- [ ] Budget alert API Anthropic (50 EUR/mese)
- [ ] GDPR: valutare DPIA per indicizzazione email aziendali

## Da fare — Integrazione backend (Cloud Functions)
- [ ] Collegare API routes TypeScript a Firestore reale (oggi sono stub in-memory)
- [ ] Deploy Cloud Functions su nexo-hub-15f2d (us-central1)
- [ ] Cloud Function `iris-ingestor`: polling EWS ogni 30s, scrive email grezze in Firestore
- [ ] Cloud Function `iris-classifier`: trigger su nuova email, classifica con Haiku, salva risultato
- [ ] Cloud Scheduler per attivare `iris-ingestor` ogni 30s
- [ ] Gestione watermark EWS (non riprocessare email già viste in memoria persistente)
- [ ] Gestione errori e retry su fallimento EWS o API Haiku
- [ ] Prompt caching sul system prompt (~3k token) per ridurre costi Haiku

## Da fare — Feedback loop
- [ ] Endpoint POST `/api/emails/:id/correct` collegato a Firestore (oggi fa console.log)
- [ ] Collection `iris_corrections` popolata lato client al submit del modale
- [ ] Arricchimento prompt classificatore con esempi dalle correzioni (few-shot dinamico)
- [ ] Dashboard: conteggio correzioni per categoria, trend accuratezza nel tempo

## Da fare — Tassonomia (emerso dai test reali)
- [ ] Aggiungere categoria `OFFERTA_FORNITORE` (distinta da `FATTURA_FORNITORE`)
- [ ] Aggiungere chiave `fornitore` a `ExtractedEntities`
- [ ] Valutare categoria `NOTIFICA_SISTEMA` (MPVoIP, Canon, reminder automatici)

## Da fare — v0.2 (dopo 2 settimane di uso v0.1)
- [ ] Notifiche Web Push per email urgenti (GUASTO_URGENTE + PEC_UFFICIALE)
- [ ] Integrazione HERMES: notifica vocale su email importanti
- [ ] Notifiche Telegram per quando sei fuori ufficio
- [ ] Multi-casella (info@acgclimaservice.com oltre alla personale)
- [ ] Arricchimento da COSMINA (chi è il cliente, storico interventi)
- [ ] Azioni automatiche suggerite (bozza risposta, apri intervento)

## Funzionalità vocale (v0.3)
- [ ] Bottone microfono su ogni card email nella PWA
- [ ] L'utente preme il microfono e dice cosa fare dell'email (es. "rispondi che domani mandiamo il tecnico", "inoltra a Malvicino", "archivia")
- [ ] Speech-to-text via Whisper API (o browser Web Speech API per prototipo veloce)
- [ ] Il comando vocale viene interpretato da Claude e tradotto in azione
- [ ] L'azione viene scritta sulla nexo_lavagna se coinvolge un altro Collega
- [ ] Integrazione con HERMES per comandi vocali da desktop (bidirezionale)
