# MEMO — Mappa ACG Suite (apps + risorse)

> **Source:** `acg_suite/COSMINA/firebase/landing/index.html` + scansione Firestore + osservazione deploy
> **Aggiornato:** 2026-04-22

## 1. Apps della Suite

| App | URL produzione | Firebase project | Stack | Funzione principale |
|---|---|---|---|---|
| **Landing ACG Suite** | `acgsuite.web.app` | `garbymobile-f89ac` (hosting site `acgsuite`) | Vanilla JS + Firebase Auth | SSO unificato + dashboard apps |
| **COSMINA** | `cosmina.acgsuite.it` (+ `cosmina.web.app`) | `garbymobile-f89ac` | Vanilla JS + Cloud Functions (Express) | Gestione impianti, CURIT, dichiarazioni, CRM, bacheca interventi |
| **PWA Tecnici** | `cosmina.web.app/tecnico/` | `garbymobile-f89ac` | Vanilla JS PWA | Portale tecnici mobile |
| **Guazzotti TEC** | `tec.acgsuite.it` (+ `guazzotti-tec.web.app`) | **`guazzotti-tec`** | Vanilla JS + Tailwind | RTI, contabilizzazioni, ticket, fatture Guazzotti |
| **KANT** | `kant-v2.web.app` | `garbymobile-f89ac` | Vanilla JS | Gestione cantieri, materiali, Gantt |
| **READER** | `reader-acg.web.app` | `garbymobile-f89ac` | Vanilla JS | Rapporti di controllo efficienza energetica |
| **DOC** | `acg-doc.web.app` | `garbymobile-f89ac` | Vanilla JS | Proforma, preventivi, ordini, DDT, crediti |
| **GRAPH** | `graph-acg.web.app` | `garbymobile-f89ac` | Node.js | Template PDF, design system, numerazione |
| **Spegnimento 2026** | `cosmina.web.app/spegnimento/` | `garbymobile-f89ac` | Vanilla JS | Stato live campagna spegnimento |
| **NEXO** ⭐ | `nexo-hub-15f2d.web.app` | **`nexo-hub-15f2d`** | Vanilla JS + Cloud Functions (Node) | Colleghi AI, NEXUS chat, Lavagna |
| **Diogene** | (Railway) | — | FastAPI + React | Backoffice TBD |
| **HERMES** | `/mnt/c/HERMES/` (Electron locale) | — | Electron | Voice assistant Windows |
| **Magazzino Pro** | `magazzino.pythonanywhere.com` | — | Flask | Magazzino standalone (non Firestore) |
| **DARWIN** | (script locali) | `garbymobile-f89ac` (log) | Multi-agent CLI | Dev/ops tooling |
| **CosminaMobile** | (app nativa) | `garbymobile-f89ac` | React Native + Expo | Mobile app |

## 2. SSO — meccanismo

1. User login su `acgsuite.web.app` con email+password Firebase Auth (project `garbymobile-f89ac`)
2. Click su card app → chiamata `POST /api/auth/token` a `cosminaApi` con `Authorization: Bearer <idToken>`
3. Endpoint backend genera **customToken** con eventuali claims (`role: admin` per TEC admin)
4. Browser apre `<appUrl>?authToken=<customToken>` in nuova tab
5. App target chiama `firebase.auth().signInWithCustomToken(authToken)` → user autenticato
6. URL viene pulito (`history.replaceState`) per non lasciare token nella history

Card app con `noSSO: true` → apertura diretta senza custom token (per app indipendenti).

**NEXO** è ora pieno membro SSO (noSSO rimosso). Usa Firebase Auth secondary app ("acg-auth") con projectId=garbymobile-f89ac.

## 3. Firebase projects

### 3.1 `garbymobile-f89ac` (ACG hub principale)

- **Auth**: utenti ACG (email + ruoli via `acg_users` + `app_permissions.<appKey>`)
- **Firestore**: 120 collection (vedi `memo-firestore-garbymobile.md`)
- **Hosting sites**: `cosmina` (default), `cosmina-tecnico`, `acgsuite`, `kant-v2`, `reader-acg`, `acg-doc`, `graph-acg`
- **Functions**: ~65 (vedi `memo-cloud-functions.md`)
- **Region default**: `us-central1`; alcune in `europe-west1`
- **Number**: `447585714`

### 3.2 `guazzotti-tec` (Guazzotti Energia)

- **Firestore**: 22 collection (rti, rtidf, tickets, pending_rti, pagamenti_clienti, etc. — vedi `memo-guazzotti-tec-map.md`)
- **Hosting site**: `guazzotti-tec` (+ dominio `tec.acgsuite.it`)
- **Auth**: condiviso con garbymobile via custom token (regole Firestore leggono `request.auth.token.role == "admin"`)
- **Region**: `europe-west1`
- **Number**: `523311919096`

### 3.3 `nexo-hub-15f2d` (NEXO — Colleghi AI)

- **Firestore**: ~15 collection (iris_emails, nexus_chat, nexus_sessions, nexo_lavagna, pharo_alerts, etc.)
- **Hosting**: `nexo-hub-15f2d`
- **Auth**: **delegato a garbymobile-f89ac** (SSO condiviso)
- **Functions**: `nexusRouter`, `pharoRtiDashboard`, `pharoResolveAlert`, `pharoCheckRti`, `pharoHealthCheck`, `irisPoller`, `irisPollerRun`, `irisRuleEngine`, `irisPollScheduled`, `suggestReply` (region `europe-west1`)
- **Number**: `272099489624`

## 4. Mappa apps × collection × functions

| App | Collection principali (garbymobile-f89ac) | Functions principali |
|---|---|---|
| **Landing Suite** | `acg_users`, `gdpr_consents` | `cosminaApi /api/auth/*` |
| **COSMINA** | `crm_clienti`, `bacheca_cards`, `cosmina_impianti`, `cosmina_impianti_cit`, `cosmina_contatti_*`, `cosmina_campagne`, `cosmina_ripartitori`, `cosmina_warranties`, `cosmina_inbox` | `cosminaApi`, `cosminaCreateIntervento`, `cosminaSearchInterventi`, `crm*`, trigger bacheca |
| **PWA Tecnici** | `bacheca_cards`, `agendaActivities`, `dailyClosures` | sub-routes di `cosminaApi` |
| **Guazzotti TEC** | (su progetto `guazzotti-tec`) `rti`, `rtidf`, `tickets`, `pending_rti`, `pagamenti_clienti`, `commesse`, `mpls` | `monitorPendingRti` (ACG lato) + functions su guazzotti-tec |
| **KANT** | `cantieri` | nessuna function dedicata |
| **READER** | `reader_impianti` | nessuna dedicata |
| **DOC** | `docfin_documents`, `docfin_fatture_guazzotti`, `docfin_payment_snapshots`, `docfin_crm_*` | `onFatturaGuazzottiCreated`, `onDocfinDocumentWrite`, `sendPrefattura`, `approvaPrefattura`, `marcaComeFatturato` |
| **GRAPH** | `graph_documents`, `graph_templates`, `graph_counters`, `graph_companies`, `graph_config` | `graphApi` |
| **Spegnimento 2026** | `bacheca_cards` (filter campagna), `cosmina_campagne` | `onSpegnimentoCardChange`, `refreshSpegnimentoStats`, `sendWalkbyRecapEmail`, `onWalkbyCardClosed` |
| **NEXO** ⭐ | (su nexo-hub-15f2d) `iris_emails`, `nexus_chat`, `nexo_lavagna`, `pharo_alerts`, `echo_messages`, `calliope_bozze` · + **lettura cross-project** da garbymobile-f89ac (crm_clienti, bacheca_cards, cosmina_impianti, cosmina_contatti_interni, magazzino, etc.) + da guazzotti-tec (rti, rtidf, pagamenti_clienti) | `nexusRouter`, `pharoCheckRti`, `pharoRtiDashboard`, `irisPoller`, `irisRuleEngine` |
| **DARWIN** | `darwin_*` (15 collection) | trigger su `darwin_queue` |
| **HERMES** | `hermes_mail_log`, `hermes_mail_processed`, `hermes_todos` | (Electron locale, niente functions) |
| **Magazzino Pro** | — (Python/Flask, DB separato?) | — |

## 5. Integrazioni cross-project

### 5.1 ACG → Guazzotti (stesso SSO)

- Custom token generato lato garbymobile-f89ac con claim `role: admin` → passed a `tec.acgsuite.it`
- Rules Firestore guazzotti-tec leggono `request.auth.token.role == "admin"`

### 5.2 Guazzotti → ACG (webhook WhatsApp)

- Config `whatsapp_config` di guazzotti-tec punta a Cloud Function di **garbymobile-f89ac**
- La Cloud Function WhatsApp vive in ACG, non in Guazzotti

### 5.3 NEXO → ACG + Guazzotti (lettura)

- **Service Account**: `272099489624-compute@developer.gserviceaccount.com` (nexo-hub-15f2d)
- Ruoli cross-project concessi:
  - `roles/datastore.user` su `garbymobile-f89ac` (per ARES, MEMO, PHARO — lettura bacheca_cards, crm_clienti, ecc.)
  - `roles/datastore.user` su `guazzotti-tec` (per PHARO — lettura rti/rtidf/tickets)
- Pattern: `initializeApp({projectId: "..."}, "<alias>")` come secondary Firebase app
- **Auth**: NEXO usa Firebase Auth di garbymobile-f89ac (non del proprio progetto) per allineare login alla Suite

## 6. Deploy commands (reference)

```bash
# COSMINA e app sullo stesso progetto
cd ~/acg_suite/COSMINA/firebase && ./deploy.sh cosmina|tecnico|functions|reader|acgsuite|doc

# Guazzotti TEC
cd ~/acg_suite/Guazzotti_Tec && npm run build-prod && npx firebase-tools deploy

# NEXO (PWA + functions)
cd ~/maestro-bridge/projects/nexo-pwa && npx firebase-tools deploy --only hosting --project nexo-hub-15f2d
cd ~/maestro-bridge/projects/iris && npx firebase-tools deploy --only functions --project nexo-hub-15f2d
```

## 7. Note

- **Firestore rules di garbymobile-f89ac**: audit completo richiesto prima di qualsiasi rules change (`./deploy.sh` ha pre-deploy hook `audit-firestore-rules.sh`)
- **COSMINA ha un deploy.sh ufficiale** — non usare mai `firebase deploy` diretto (rischio di skippare audit/backup)
- **Region**: quando aggiungi functions a NEXO, usare sempre `europe-west1` (coerente con esistenti)
- **Cache busting PWA**: dopo deploy hosting, eseguire in console: `caches.keys().then(k => k.forEach(x => caches.delete(x))); location.reload(true)`
