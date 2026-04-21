# MEMO — Firestore garbymobile-f89ac (mappa completa)

> **Responsabile:** MEMO
> **Project Firebase:** `garbymobile-f89ac` (COSMINA, DARWIN, HERMES, GRAPH, DOCFIN, MAGAZZINO, ACG shared)
> **Scansione:** 2026-04-22
> **Root collections trovate:** 120
> **Script:** `scripts/memo_scan_garbymobile.py` · Export: `scripts/memo_scan_garbymobile.json`

---

## 0. Indice rapido per dominio

### 🏢 CRM e anagrafiche
- `crm_clienti` (647) — clienti ACG con 72 campi ricchi (board Trello, amministratori, campagne, cartelle rete)
- `crm_gruppo_badano` (318) — clienti Gruppo Badano
- `cosmina_contatti_clienti` (2000+) — contatti clienti (telefoni, email)
- **`cosmina_contatti_interni` (34)** ⭐ — **RUBRICA CONTATTI INTERNI ACG/Guazzotti** — usa per ECHO
- `rubrica` (2000+) — importazioni Google Contacts (meno strutturata)

### ⚙️ Impianti e CURIT
- `cosmina_impianti` (326) — impianti clienti (84 campi, estrazione CURIT)
- `cosmina_impianti_cit` (88) — dettagli CIT/CURIT approfonditi (dichiarazioni, generatori)
- `cit_impianti` (88) — alias/vecchia versione
- `reader_impianti` (211) — impianti scansionati da READER (rapporti efficienza)

### 🔧 Interventi e bacheca
- **`bacheca_cards` (2000+)** ⭐ — **interventi pianificati** (Trello-sync, `listName=INTERVENTI`)
- `agendaActivities` (370) — attività agenda
- `dailyClosures` (88) — chiusure giornaliere

### 📢 Campagne e comunicazioni
- `cosmina_campagne` (10) — campagne operative (spegnimento, riempimenti, cambio ora)
- `cosmina_campagne_reports` (21) — report campagne
- `campaigns` (0) — vuota (legacy?)

### 📦 Magazzino
- **`magazzino` (781)** ⭐ — catalogo articoli (codice, descrizione, categoria, prezzo)
- **`magazzino_giacenze` (577)** ⭐ — giacenze per magazzino (articolo_id → quantita/scorta_minima)
- `magazzino_listini` (407) — listini fornitori
- `magazzino_movimenti` (333) — log movimenti (carico/scarico)
- `magazzino_kit` (5) — kit assemblati

### 💰 Fatturazione e finanza
- **`docfin_fatture_guazzotti` (114)** ⭐ — fatture parsate Guazzotti (pdf → dati strutturati)
- `docfin_documents` (1385) — documenti fiscali generici
- `docfin_documenti` (1) — legacy
- `docfin_crm_queue` (6) — queue match CRM
- `docfin_crm_snapshots` (6) — snapshot CRM per dedup
- `docfin_payment_snapshots` (14) — snapshot pagamenti

### 🏗️ Cantieri e garanzie
- `cantieri` (33)
- `cosmina_warranties` (49) — garanzie
- `cosmina_warranty_pending` (112) — da processare
- `dossier_riqualificazione` (35) — dossier riqualificazione energetica

### 📊 Ripartitori UNI 10200
- **`cosmina_ripartitori` (65)** ⭐ — sostituzione ripartitori condominiali

### 👤 Utenti e tecnici
- **`acg_tecnici` (9)** ⭐ — tecnici ACG (nome, competenze, zone, disponibilità)
- `acg_users` (17) — utenti app (auth, ruoli)
- `acg_presence` (10)
- `cosmina_config` (33) — configurazioni (include `tecnici_acg`, `ares_config`, etc)

### 📧 Email e comunicazione
- `cosmina_emails` (400) — email processate
- `cosmina_email_locks` (242) — lock processing
- `cosmina_inbox` (308) — inbox interna
- `cosmina_notifiche` (981) — notifiche interne

### 📝 Log e audit
- **`audit_log` (2000+)** ⭐ — audit tutti gli endpoint (email, uid, ip, user_agent)
- `cosminaLogs` (217) — log operativi
- `acg_events` (5) + `acg_events_log` (2) + `acg_triggers_log` (1441) — eventi trigger
- `ai_audit_log` (29) — log AI interactions
- `hermes_mail_log` (161) + `hermes_mail_processed` (199) — HERMES (voice assistant Windows)
- `hermes_todos` (3)

### 🤖 AI / DARWIN
- `darwin_commands` (102), `darwin_conversations` (0), `darwin_costs` (1), `darwin_inbox` (299)
- `darwin_live_log` (501), `darwin_log` (684), `darwin_metrics` (36), `darwin_patterns` (2)
- `darwin_planning` (9), `darwin_proposals` (84), `darwin_queue` (1), `darwin_reports` (125)
- `darwin_status` (1), `darwin_tasks` (3), `darwin_twin` (1)

### 🎨 GRAPH (design system + PDF)
- `graph_documents` (641) — documenti PDF generati
- `graph_templates` (47) — template
- `graph_counters` (33) — numerazione
- `graph_companies` (1), `graph_config` (1)

### 📲 WhatsApp
- `whatsapp_config` (1), `whatsapp_messages_log` (14)
- `whatsapp_routing_rules` (1), `whatsapp_stats` (1)
- `cosmina_wa_pending` (1)

### 🔐 Sicurezza e accesso
- `acg_api_keys` (5), `apiKeys` (1)
- `gdpr_consents` (14)

### 🔄 Queue e processing
- `cosmina_queue` (1454) — coda generica
- `cosmina_excel_queue` (27)
- `cosmina_extraction_queue` (1)
- `cosmina_document_results` (2)
- `cosmina_bozze` (1376) — bozze documenti

### 🚨 Alarm / monitoring
- `alarm_config`, `alarm_devices`, `alarm_events` (28), `alarm_pending` (14), `alarm_rules`, `alarm_users`

### ⚡ Altri
- `commesse` (10), `comandi` (1), `fornitori` (2)
- `lista_spesa` (68)
- `settings` (10), `cosmina_stats` (1), `cosmina_status` (6)
- `trelloSync` (2000+), `trello_boards` (674), `trello_audit_log` (2), `trello_sync_logs` (5)
- `matching_cache` (3), `parsing_cache` (2), `parsing_logs` (9)
- `view_cache` (2000+)
- `pendingPushNotifications` (24), `push_tokens` (7)
- `adminNotifications` (53)
- `dailyTasksStatus` (5)
- `acg_chat_messages` (3), `acg_chatbot_sessions` (18), `acg_feedback` (10), `acg_vp_cache` (1)
- `cosmina_chat_messages` (140), `cosmina_commands` (2), `cosmina_presence` (1), `cosmina_rubrica_alerts` (119)
- `cosmina_worker_logs` (2), `cosmina_workers` (4), `directChats` (0), `interventionCounters` (2)
- `test` (17)

---

## 1. Schema collection chiave

### 1.1 `cosmina_contatti_interni` ⭐ (rubrica ACG/Guazzotti)

**34 documenti · 12 campi**

| Campo | Tipo | Esempio |
|---|---|---|
| `_id` | string (auto-id) | `18BZksIeuCaQOMpKek0T` |
| `nome` | string | `FRANCO` |
| `cognome` | string | (presente in 2000+ docs di `cosmina_contatti_clienti`, non sempre qui) |
| `categoria` | string | `ufficio` o `tecnico` |
| `azienda` | string | `ACG Clima Service S.R.L.` o `Guazzotti Energia S.R.L.` |
| `interno` | string (nullable 7/25) | `219` |
| `telefono_personale` | string (nullable 15/25) | `351 945 6829` |
| `telefono_lavoro` | string (nullable 20/25) | `351 915 6376` |
| `email` | string (nullable 4/25) | `xxx@xxx.xxx` |
| `origine` | string | `contatti_html_import` |
| `google_resource_name` | string | `people/c7837326040744560946` |
| `created_at`, `updated_at` | timestamp | — |

> **Usa questa per ECHO WhatsApp contact lookup.** Fuzzy search su `nome`+`cognome` (o `nome_completo` se fosse presente), poi prioritizza `telefono_personale` → `telefono_lavoro` → `interno`.

### 1.2 `crm_clienti` ⭐ (anagrafica condomini/clienti)

**647 docs · 72 campi**. Doc ID = codice ACG (es. `A001`, `U058`).

Campi principali:
- `codice`, `board_name` (`A001 - CONDOMINIO DON MINZONI 80 - VIA...`)
- `nome` (mancante — usa `board_name` o `nome` custom)
- `indirizzo`, `citta`, `cap`, `provincia`
- `amministratore` (nome+cognome)
- `cartella_rete` (Windows share N:\...)
- `contratto`, `ac2_contratto` (bool), `contratto_pdf_nota`, `contratto_pdf_path`
- `codice_adhoc_acg`, `codice_condominium_acg`, `codice_gzt` — mapping CRM esterni
- `campagne` (lista id campagne)
- `acc_spegn` (accensione/spegnimento), `cambio_ora`
- `cf_piva`, `catasto`, `foglio`, `subalterno`
- `contabilizzazione` (`Diretta` / `Indiretta`)
- `anno_installazione_rip` (ripartitori)

### 1.3 `cosmina_impianti` (CURIT + impianti)

**326 docs · 84 campi**

Campi principali per PHARO/DIKEA:
- `codice`, `codice_impianto` (es. `3541378`)
- `targa` → CURIT (es. `V91MY21857693003`)
- `indirizzo`, `comune`, `cap`, `provincia`
- `occupante_cognome`, `occupante_nome`
- `amministratore_cognome`, `amministratore_nome`
- `combustibile` (`GAS NATURALE`, ecc.)
- `data_scadenza_dichiarazione` (formato DD/MM/YYYY)
- `data_prossimo_contributo` → **usare per scadenze PHARO/DIKEA**
- `data_ultima_dichiarazione`, `data_prima_dichiarazione`
- `giorni_ritardo_manutenzione`, `giorni_ritardo_contributo`
- `sottoposizione_dpr_412` (Si/No)
- `dichiarato` (bool)
- `conformita` (Si/No)
- `certificazione_energetica`
- `dam` (Sc, ecc.)
- `categoria_edificio` (`E1 - E1 - ...`)
- `attestato_prestazione_energetica` (codice APE)
- `provenienza_dati` (`Autodichiarazione`)
- `ultimo_aggiornamento_curit`
- `prima_rilevazione`, `updated_at`

### 1.4 `cosmina_impianti_cit` (dettaglio CIT)

**88 docs · 69 campi**. Approfondimento CIT/CURIT (dichiarazioni, REE, bollini).

Campi chiave:
- `_accordion_impianto`, `_accordion_proprietario`, `_accordion_responsabile` (dict)
- `_campi_base`, `campi_raw` (dict con dati CURIT raw)
- `data_prossimo_ree`, `data_ultimo_ree`
- `data_scadenza_manutenzione`
- `dichiarazioni` (list), `generatori` (list), `gestori` (list)
- `fonte` = `sigitwebn` (endpoint CURIT Piemonte)
- `elenco_controlli` (dict)
- `ente_competente` (es. `Regione Piemonte`)

### 1.5 `bacheca_cards` ⭐ (interventi pianificati)

**2000+ docs · 50 campi**. Sync da Trello board ACG.

Filtro per interventi aperti: `listName == "INTERVENTI"` + `inBacheca == true` + `stato != "completato"`.

Campi principali:
- `_id` (auto-id Firestore), `originalCardId` (Trello card id)
- `boardName` (es. `ZZ000 - CLIENTI PRIVATI E GENERICI`, `A001 - CONDOMINIO ...`)
- `originalBoardId` (Trello board id)
- `crm_id` (FK → `crm_clienti._id`)
- `listName` (`INTERVENTI`, `INTERVENTI DA ESEGUIRE`, `TICKET DA CHIUDERE`, `ORDINI GUAZZOTTI DA RICHIEDERE`, `ACCENSIONE/SPEGNIMENTO`, `CAMBIO ORA`)
- `name` (titolo), `desc` (testo), `workDescription`, `workHours`
- `stato` (`aperto`, `chiuso`, ecc.)
- `techName`, `techNames` (list) — tecnico assegnato
- `amministratore`
- `due` (scadenza ISO), `dateLastActivity`
- `campagna_id`, `campagna_nome`
- `zona`, `idList`, `archiviato`, `inBacheca`, `customFieldItems`, `labels`
- `attachments` (list), `attachmentsCount`
- `checklists`, `checklistsCount`

### 1.6 `cosmina_campagne`

**10 docs · 14 campi**. Campagne operative stagionali.

Campi:
- `nome` (`RIEMPIMENTI 2026`, `SPEGNIMENTO 2026`, ecc.)
- `stato` (`aperta`, `archiviata`)
- `data_inizio`, `data_fine` (nullable)
- `descrizione`, `descrizione_dettagliata`
- `archiviata` (bool), `tags`, `allegati`
- `source`, `created_by`, `created_at`, `updated_at`

### 1.7 `magazzino` ⭐ (catalogo articoli)

**781 docs · 33 campi**

Campi chiave:
- `codice` (es. `MAT-GHISA-BOCCHETTONI-1-4IN`)
- `descrizione` (es. `Bocchettoni Ghisa 1/4"`)
- `gruppo` (`MATERIALE`, ecc.), `mat_gruppo` (`idraulico`, ecc.), `mat_categoria`, `mat_sottocategoria`
- `codice_costruttore`, `codice_fornitore`
- `fornitore` (es. `RUBINETTERIE BRESCIANE BONOMI SPA`)
- `marca`, `modello`
- `prezzo_acquisto` (float/int)
- `mat_attacco`, `mat_diametro`
- `photos`, `fileUrl`, `fileType`
- `createdBy`, `createdAt`, `note`, `fonte`

### 1.8 `magazzino_giacenze` ⭐ (stock per magazzino)

**577 docs · 7 campi**. Chiave logica: `articolo_id × magazzino_id`.

| Campo | Esempio |
|---|---|
| `_id` | `<articolo_id>_<magazzino_id>` (es. `0AoOJ..._centrale`) |
| `articolo_id` | FK → `magazzino._id` |
| `magazzino_id` | `centrale`, ecc. |
| `quantita` | int |
| `scorta_minima` | int |
| `qta_riordino` | int |
| `data_aggiornamento` | timestamp |

**Query sotto-scorta**: `where quantita < scorta_minima AND scorta_minima > 0`.

### 1.9 `magazzino_listini`, `magazzino_movimenti`, `magazzino_kit`

- `magazzino_listini` (407) — listini per fornitore
- `magazzino_movimenti` (333) — log carico/scarico
- `magazzino_kit` (5) — kit prefabbricati

### 1.10 `docfin_fatture_guazzotti` (fatture Guazzotti parsate)

**114 docs · 18 campi**

- `_id` (`FATGZ_2024_125-V6`)
- `numero` (`125/V6`), `data` (timestamp)
- `importoNetto`, `iva`, `totale`
- `ivaNote` (`Art.17 c.6 lett.a - ter`)
- `pagamento` (es. `Bonifico 60 gg F.M`)
- `scadenza` (nullable!) — **spesso None** → calcolo manuale da `data` + `pagamento`
- `stato` (`pagata`, ecc.)
- `descrizioneRighe` (list)
- `emailMessageId`, `emailSubject`, `source` (`email`)
- `pdfUrl`, `pdfStoragePath`

### 1.11 `cosmina_ripartitori` (UNI 10200)

**65 docs · 28 campi**. Sostituzione ripartitori per condomini.

- `nome_card` (`CONDOMINIO PRIMAVERA`)
- `fornitore` (es. `ISTA`)
- `avanzamento` (`TERMINATO COMPLETO`, ecc.)
- `stato_commerciale` (`PAGATO CHIUSO`)
- `tipo_rdo` (`DEFINITIVO`)
- `totale_appartamenti`, `numero_piani`, `numero_scale`
- `ripartitori_da_sostituire`, `ripartitori_installati`
- `appartamenti_master`, `preventivi`, `passaggi` (list)
- `dati_condominio`, `fatture_condominio`, `fatture_fornitore`
- `richiesta_letture`, `tipologia_radiatori`

### 1.12 `acg_tecnici` ⭐

**9 docs · 7 campi**. Anagrafica tecnici.

- `_id` = slug nome (es. `alberto`)
- `nome` (`ALBERTO`)
- `attivo` (bool)
- `competenze` (list)
- `zone` (list)
- `disponibilita` (dict)
- `creato` (timestamp)

### 1.13 `audit_log` (endpoint calls log)

**2000+ docs · 7 campi**. Log di tutte le chiamate API.

- `uid` (Firebase Auth uid), `email`
- `endpoint` (es. `GET /api/rubrica/alerts`)
- `ip`, `user_agent`
- `timestamp`

---

## 2. Relazioni tra collection

```
  crm_clienti ──┐
   │  codice    │  board_id
   │            ▼
   │     bacheca_cards ◄─── trello_boards
   │            │ crm_id
   │            │
   │      agendaActivities
   │            │
   │            │
   │      cosmina_impianti ◄─── cosmina_impianti_cit
   │       │ codice/targa
   │       │
   │       └─► dichiarazioni CURIT
   │
   ├─► cosmina_contatti_interni (rubrica)
   ├─► cosmina_contatti_clienti (contatti)
   └─► cosmina_ripartitori (nome_card)

  magazzino ──┬─► magazzino_giacenze (articolo_id × magazzino_id)
              ├─► magazzino_listini (fornitore)
              ├─► magazzino_movimenti (articolo_id)
              └─► magazzino_kit

  cosmina_campagne ◄── crm_clienti.campagne[]

  docfin_fatture_guazzotti ◄── emailMessageId ◄── cosmina_emails
  docfin_documents → docfin_payment_snapshots

  graph_documents ── graph_templates, graph_counters
```

---

## 3. Mappa Cloud Functions

Vedi `context/memo-cloud-functions.md` per lista completa.

---

## 4. Nomi definitivi per MEMO/ECHO/ARES/etc.

| Collega | Collection chiave |
|---|---|
| **ECHO** (rubrica) | `cosmina_contatti_interni` |
| **MEMO** (dossier) | `crm_clienti` + `cosmina_impianti` + `bacheca_cards` + `cosmina_contatti_interni` |
| **ARES** (interventi) | `bacheca_cards` (listName=INTERVENTI) |
| **CHRONOS** (agende) | `bacheca_cards` + `cosmina_campagne` + `acg_tecnici` |
| **PHARO** (scadenze) | `cosmina_impianti` (`data_prossimo_contributo`) |
| **DIKEA** (CURIT) | `cosmina_impianti` + `cosmina_impianti_cit` |
| **EMPORION** (magazzino) | `magazzino` + `magazzino_giacenze` |
| **CHARTA** (fatture) | `docfin_fatture_guazzotti` + `docfin_documents` |
| **DELPHI** (KPI) | `audit_log` + `cosmina_stats` + aggregati |

---

## 5. Note operative

1. **`cosmina_contatti_interni` vs `cosmina_contatti_clienti` vs `rubrica`**: tre tipi diversi.
   - `cosmina_contatti_interni` (34): colleghi/tecnici ACG+Guazzotti → **ECHO**
   - `cosmina_contatti_clienti` (2000+): clienti (Google Contacts import) → **NON usare per rubrica interna**
   - `rubrica` (2000+): importazione generica, meno strutturata
2. **Cosmina config**: il doc `cosmina_config/tecnici_acg` (se esiste, non emerso nel sample top-level) potrebbe avere lista ruoli/permessi. Investigare.
3. **CIT doppio**: `cosmina_impianti_cit` e `cit_impianti` hanno entrambi 88 docs — probabile duplicato. Verificare quale usa il codice applicativo live.
4. **Campagne 0 vs 10**: `campaigns` vuota, `cosmina_campagne` attiva (10 docs).
5. **`trelloSync`**: è la tabella di sync raw. I dati finali sono in `bacheca_cards`. Usare `bacheca_cards` per query business.
6. **Gli `_id` di `crm_clienti`** sono codici ACG (A001, U058, etc.) — chiave logica stabile.

---

## 6. Metadati scansione

- Tool: `firebase_admin` 7.1.0 via ADC
- Cap: 2000 docs per collection (alcune collection possono avere più documenti)
- PII masking: email → `***@***`, CF → `***CF***`
- Limiti: nessun deep-dive su subcollections (solo top-level)
