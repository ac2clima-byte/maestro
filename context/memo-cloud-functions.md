# MEMO — Cloud Functions garbymobile-f89ac

> **Project:** `garbymobile-f89ac`
> **Scansione:** 2026-04-22
> **Source:** `gcloud functions list --project=garbymobile-f89ac`

---

## Lista completa (65 functions rilevate)

### 🔵 Core API HTTP (us-central1)

| Funzione | Tipo | Descrizione breve |
|---|---|---|
| **`cosminaApi`** | HTTP Express | **API principale COSMINA** (Express router con tutte le rotte `/api/*`) — include `/api/auth/token` per SSO |
| `cosminaCreateIntervento` | HTTP | Crea intervento (scrive in `bacheca_cards`) |
| `cosminaGetIntervento` | HTTP | Read intervento |
| `cosminaSearchInterventi` | HTTP | Ricerca interventi |
| `cosminaSearchClienti` | HTTP | Ricerca clienti CRM |
| `cosminaGetClienteDetails` | HTTP | Dettaglio cliente |
| `cosminaGetTecnici` | HTTP | Lista tecnici |
| `cosminaDiscovery` | HTTP | Discovery service |
| `cosminaEmailService` | HTTP | Gestione email |
| `crmGetCliente` | HTTP | Read CRM cliente |
| `crmSearchClienti` | HTTP | Ricerca CRM |
| `crmSyncFromTrello` | HTTP | Sync CRM da Trello |

### 👥 Utenti e tecnici

| Funzione | Descrizione |
|---|---|
| `createAcgUserHttp` | Crea utente ACG (Firebase Auth + acg_users doc) |
| `deleteAcgUserHttp` | Elimina utente |
| `listAcgUsersHttp` | Lista utenti |
| `updateAcgUserPermissionsHttp` | Update permessi (app_permissions) |
| `verifyAcgUserHttp` | Verifica utente |
| `addTecnico` / `updateTecnico` / `getTecnico` / `getTecnici` | CRUD `acg_tecnici` |

### 💰 Fatturazione e prefatture

| Funzione | Descrizione |
|---|---|
| `approvaPrefattura` | Approva prefattura |
| `rifiutaPrefattura` | Rifiuta prefattura |
| `sendPrefattura` | Invia prefattura |
| `sendPreventivo` | Invia preventivo |
| `sendRichiestaOfferta` | Invia RdO |
| `generaRichiestaOffertaAI` | Genera RdO via AI (Claude?) |
| `marcaComeFatturato` | Marca intervento come fatturato |
| `onFatturaGuazzottiCreated` | **Trigger** Firestore onCreate su `docfin_fatture_guazzotti` |

### 📋 Trello sync

| Funzione | Descrizione |
|---|---|
| `syncTrelloToFirestoreHttp` | Sync manuale Trello → Firestore |
| `trelloWebhook` | Webhook Trello (cards updates) |
| `cleanOldSyncUpdates` | Cleanup vecchi sync updates |
| `onTrelloSyncRubrica` | **Trigger** onCreate: sync rubrica da Trello |
| `onBachecaCardSyncTech` | **Trigger** onWrite: sync tecnico assegnato |
| `proxyTrelloImage` | Proxy immagini Trello (CORS) |

### 🔥 Spegnimento 2026

| Funzione | Descrizione |
|---|---|
| `onSpegnimentoCardChange` | **Trigger** onWrite card spegnimento |
| `refreshSpegnimentoStats` | Aggiorna stats (europe-west1) |
| `sendWalkbyRecapEmail` | Invia recap via email (europe-west1) |
| `onWalkbyCardClosed` | **Trigger** onWrite card walkby chiusa |

### ⏰ Scheduled (remind interventi)

| Funzione | Tipo | Descrizione |
|---|---|---|
| `remindInterventiMattina` | ACTIVE GEN_2 scheduled | Remind mattutino |
| `remindInterventiMattinaRetry` | ACTIVE | Retry mattina |
| `remindInterventiPomeriggio` | ACTIVE | Remind pomeriggio |
| `remindInterventiPomeriggioRetry` | ACTIVE | Retry pomeriggio |
| `sendRiepilogoGiornata` | HTTP | Riepilogo giornaliero |
| `sendRiepilogoRipartitori` | HTTP | Riepilogo ripartitori |

### 📧 Email (Gmail + HERMES)

| Funzione | Tipo | Descrizione |
|---|---|---|
| `onGmailPush` | Pub/Sub ACTIVE GEN_2 | Push notification Gmail (ricezione email real-time) |
| `renewGmailWatch` | Scheduled ACTIVE | Rinnova Gmail Watch periodico |

### 🎨 GRAPH (PDF + design system)

| Funzione | Tipo |
|---|---|
| `graphApi` | ACTIVE GEN_2 |

### 🧠 AI / analisi

| Funzione | Descrizione |
|---|---|
| `analizzaInterventiAI` | Analisi AI interventi |
| `parseAppartamentiAI` | Parsing AI appartamenti |
| `parseExcelRipartitori` | Parse Excel ripartitori |
| `parseMsgFile` | Parse file .msg |

### 📊 Altri trigger

| Funzione | Trigger |
|---|---|
| `onDocfinDocumentWrite` | Firestore onWrite `docfin_documents` |
| `onRequestCompleted` | Firestore onUpdate (richieste completate) |
| `sendPushOnNewNotification` | Firestore onCreate `cosmina_notifiche` |
| `acgEventPublishHttp` | HTTP pubblica eventi ACG |
| `getAcgEventsForAppHttp` | HTTP lista eventi per app |
| `markAcgEventReadHttp` | HTTP marca evento letto |

### 🔑 API keys + setup

| Funzione | Descrizione |
|---|---|
| `createApiKey` | Crea API key |
| `setupCosminaApiKey` | Setup iniziale |

### 📦 Storage utils

| Funzione | Descrizione |
|---|---|
| `uploadBase64ToStorage` | Upload base64 → Storage |
| `uploadFileHttp` | Upload file generico |
| `uploadPDFToStorage` | Upload PDF |

### 🚨 Monitoring

| Funzione | Tipo | Descrizione |
|---|---|---|
| `monitorPendingRti` | ACTIVE GEN_2 | Monitor pending RTI Guazzotti |
| `wahaHealthCheck` | ACTIVE GEN_2 | Health check WhatsApp Waha |
| `dataRetentionCleanup` | ACTIVE GEN_2 | Cleanup dati vecchi |
| `yearlyCounterReset` | ACTIVE GEN_2 | Reset contatori annuali (GRTI/CRTI) |
| `testPushNotification` | HTTP | Test push notifications |

---

## Regioni

- **Default**: `us-central1` (la maggior parte)
- **europe-west1**: `refreshSpegnimentoStats`, `sendWalkbyRecapEmail`, `graphApi`, alcune GEN_2

## Tipi trigger

- **HTTP onRequest**: 53 functions
- **Firestore onCreate/onWrite/onUpdate**: 8 trigger
- **Pub/Sub**: 1 (`onGmailPush`)
- **Scheduled (pubsub-schedule)**: 5+ (remind*, renew*, yearly*)

## Generation

- **GEN_2**: tutte le functions recenti con stato `ACTIVE` visibile (`dataRetentionCleanup`, `graphApi`, `monitorPendingRti`, `onGmailPush`, `remindInterventi*`, `renewGmailWatch`, `wahaHealthCheck`, `yearlyCounterReset`)
- **GEN_1**: tutte le altre (non mostrano state in output `gcloud functions list`)

---

## Per NEXO integrazione

Cloud Functions chiave per i Colleghi:

| Collega NEXO | Function rilevanti COSMINA |
|---|---|
| **MEMO** | `crmGetCliente`, `cosminaGetClienteDetails`, `cosminaSearchClienti` |
| **ARES** | `cosminaCreateIntervento`, `cosminaGetIntervento`, `cosminaSearchInterventi` |
| **CHRONOS** | `cosminaSearchInterventi` + read diretto `bacheca_cards` |
| **ECHO** (WA) | `wahaHealthCheck` (status), + read `cosmina_contatti_interni` |
| **EMPORION** | nessuna function dedicata → lettura diretta `magazzino` + `magazzino_giacenze` |
| **CHARTA** | `onFatturaGuazzottiCreated`, `sendPrefattura`, `marcaComeFatturato` + read `docfin_fatture_guazzotti` |
| **DIKEA** | read diretto `cosmina_impianti_cit` (scadenze CURIT) |
| **PHARO** | `monitorPendingRti` (già attivo) + scheduler NEXO `pharoCheckRti` |

---

## Metadati

- Tool: `gcloud functions list`
- Output JSON: non salvato (solo table format)
- Scansione: 2026-04-22
