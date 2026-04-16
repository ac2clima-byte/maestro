# IRIS — TODO v0.1

## Completato
- [x] Setup progetto (package.json, tsconfig, struttura cartelle)
- [x] Modulo email ingestion (EWS via exchangelib + wrapper TypeScript)
- [x] Classificatore email (Claude Haiku + prompt contestualizzato ACG Clima)
- [x] Schema Firestore (IrisEmailDoc, IrisCorrectionDoc)
- [x] API routes (GET emails, GET email/:id, POST correct, GET stats)
- [x] PWA dashboard con dati mock (login, lista email, filtri, modale correzione)
- [x] Test connessione EWS reale a remote.gruppobadano.it

## Da fare — Integrazione
- [ ] Configurare Firebase project nexo-hub-15f2d (web app registration)
- [ ] Inserire Firebase config reale nella PWA (firebase-config.js)
- [ ] Creare utente Alberto in Firebase Auth
- [ ] Collegare PWA a Firestore reale (sostituire dati mock)
- [ ] Collegare API routes a Firestore reale (sostituire stub)
- [ ] Deploy Cloud Functions su nexo-hub-15f2d (us-central1)
- [ ] Deploy PWA su Firebase Hosting (nexo-hub-15f2d.web.app)

## Da fare — Pipeline email
- [ ] Cloud Function iris-ingestor: polling EWS ogni 30s, salva email grezze in Firestore
- [ ] Cloud Function iris-classifier: trigger su nuova email, classifica con Haiku, salva risultato
- [ ] Cloud Scheduler per attivare iris-ingestor ogni 30s
- [ ] Gestione watermark EWS (non riprocessare email già viste)
- [ ] Gestione errori e retry su fallimento EWS o API Haiku

## Da fare — Feedback loop
- [ ] Endpoint POST /api/emails/:id/correct collegato a Firestore
- [ ] Collection iris_corrections in Firestore
- [ ] Arricchimento prompt classificatore con esempi dalle correzioni (few-shot)
- [ ] Dashboard: conteggio correzioni per categoria, trend accuratezza

## Da fare — Sicurezza e produzione
- [ ] Security rules Firestore (ogni utente vede solo le sue email)
- [ ] Certificate pinning per EWS (no rejectUnauthorized:false)
- [ ] API key Anthropic dedicata per IRIS in Secret Manager
- [ ] Credenziali EWS in Secret Manager (non in .env)
- [ ] Budget alert API Anthropic (50 EUR/mese)
- [ ] GDPR: valutare DPIA per indicizzazione email aziendali

## Da fare — v0.2 (dopo 2 settimane di uso v0.1)
- [ ] Notifiche Web Push per email urgenti
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
