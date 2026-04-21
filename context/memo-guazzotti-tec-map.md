# MEMO — Mappa Firestore Guazzotti TEC

> **Responsabile conoscenza:** MEMO
> **Progetto Firebase:** `guazzotti-tec` (NB: il brief originale citava `guazzotti-energia`, ma il project reale da `.firebaserc` e `gcloud projects list` è `guazzotti-tec` — ID numerico `523311919096`)
> **Scansione:** 2026-04-21 17:47 UTC
> **Region hosting:** `europe-west1` (firebase hosting `guazzotti-tec.web.app`)
> **Root collections trovate:** 22

Questo file è la fonte di verità per tutti i Colleghi (NEXUS, IRIS, ECHO, ...) quando serve sapere **dove** trovare i dati di Guazzotti TEC.

---

## 0. Indice rapido

| Collection | Ruolo sintetico | Doc stimati (probe) | Chiave doc ID |
|---|---|---|---|
| `_counters` | Contatori numeri RTI per anno (GRTI/CRTI) | 1 | `rti_numbers` |
| `ai_audit_log` | Log operazioni dell'agente AI interno | 14 | auto-id |
| `catalogoArticoli` | Catalogo ricambi/articoli (singolo doc `default`) | 1 | `default` |
| `commesse` | Commesse/ordini fornitore (PDF parsati da AI) | 1 (prod bassa) | `<numero>/F` o `<numero>_F` |
| `emailConfig` | Configurazione destinatari email per tipo documento | 1 | `chiuturaTicket` (sic) |
| `email_archive` | Storico email ticket con allegati | 100+ | `email_<ts>` |
| `email_logs` | Log tecnico invio email | 100+ | auto-id |
| `gmail_settings` | Credenziali Gmail IMAP (app password) | 1 | `global_config` |
| `guazzotti_config` | Credenziali Gmail legacy (duplicato) | 1 | `gmail_credentials` |
| `mpls` | Multi-Preventivo Lavori Straordinari (offerte) | 7 | `MPLS-YYYY-NNN` |
| `mplsContacts` | Rubrica destinatari offerte MPLS | 1 | `contacts` |
| `notification_settings` | Config notifiche periodiche ticket aperti | 1 | `global_config` |
| `pagamenti_clienti` | Esposizione creditoria corrente per cliente | 100+ | `<CodCliente>` (10 cifre) |
| `pagamenti_snapshots` | Snapshot storici mensili esposizione | 9 | `snapshot_YYYY-MM-DD` |
| `pending_rti` | Buffer card Trello/Cosmina in attesa di diventare RTI | 84 | auto-id |
| **`rti`** | **Rapporti Tecnici Intervento (bozza → definitivo)** | **100+** (≈500) | `GRTI-YYYY-NNN` / `CRTI-YYYY-NNN` / auto-id |
| **`rtidf`** | **RTI Definitivi (snapshot congelato per fatturazione)** | **100+** (≈195) | `GRTIDF-YYYY-NNN` / `CRTIDF-YYYY-NNN` |
| **`tickets`** | **Ticket assistenza (apertura → chiusura)** | **100+** (≈500) | auto-id o `gmail_<canale>_<ts>_<n>` |
| `todo_tasks` | Task interni/roadmap app | 4 | auto-id |
| `users` | Utenti applicativi (auth custom, **password in chiaro**) | 4 | username |
| `whatsapp_config` | Config webhook Meta/Trello per WA | 1 | `global` |
| `whatsapp_routing_rules` | Regole routing messaggi WA → azione | 2 | auto-id |

---

## 1. Collection CORE (focus business)

### 1.1 `rti` — Rapporto Tecnico Intervento (bozza)

**Significato:** il RTI è il documento generato dal tecnico dopo l'intervento. In Guazzotti TEC esiste in **stato mutabile** (modificabile) finché non viene duplicato in `rtidf` (snapshot congelato per l'amministrazione).

**Sample doc id:** `CRTI-2025-003`, `GRTI-2026-012`, `3ltERABJUfM2wcAwWtn9` (auto-id bozza)

**Pattern ID convivono:**
- `GRTI-YYYY-NNN` → RTI **generico** (144 su 300)
- `CRTI-YYYY-NNN` → RTI **contabilizzazione** (155 su 300)
- `rti_<timestamp>` / auto-id → bozze iniziali

I numeri progressivi sono gestiti da `_counters/rti_numbers` (`GRTI-2026: 164`, `CRTI-2026: 34`).

**Distribuzione `stato`:**
| Stato | Count | Significato |
|---|---|---|
| `bozza` | 45 | appena creato, editabile |
| `definito` | 331 | RTI chiuso dal tecnico |
| `rtidf_presente` | 88 | è stato generato l'RTIDF corrispondente |
| `rtidf_inviato` | 28 | RTIDF spedito all'amministratore |
| `rtidf_fatturato` | 8 | RTIDF incluso in una `commesse` |

**Distribuzione `tipo`:** `generico` 344 · `contabilizzazione` 155

**Campi principali:**

| Campo | Tipo | Note |
|---|---|---|
| `id` | string | ID interno tipo `rti_<ts>` |
| `numero_rti` | string | es. `GRTI-2026-012` |
| `numero_ticket` / `numero_ticket_collegato` | string | es. `775/2026` |
| `ticket_collegato` | string | doc ID in `tickets` |
| `stato` | string | vedi distribuzione |
| `tipo` | string | `generico` \| `contabilizzazione` |
| `cliente` | string | ragione sociale (spesso `<codice> - NOME`) |
| `condominio` | string | denominazione condominio |
| `indirizzo` | string | indirizzo intervento |
| `telefono` | string | telefono cliente |
| `data` / `data_ticket` / `data_documento` / `data_intervento` | string (DD/MM/YYYY o ISO) | varie date |
| `ora_intervento` | string | HH:MM |
| `tecnico` / `tecnico_intervento` | string | nome tecnico (es. `Dellafiore Lorenzo`) |
| `numero_operai` | string | contatore operai |
| `ore_lavorate` | string | |
| `materiali` | array<map> | lista materiali (spesso vuota) |
| `materiale_utilizzato` | string | testo libero materiali |
| `intervento_richiesto` | string | motivo chiamata |
| `intervento_effettuato` | string | descrizione intervento (testo lungo) |
| `note` | string | note libere |
| `commessa` | string | numero commessa fornitore (se c'è) |
| `fatturabile` | bool | flag fatturabilità |
| `fatturabile_modificato_il` / `stato_modificato_il` | string ISO | audit |
| `rtiPdfContent` | string (base64 o HTML, ~95-110KB) | PDF embeddato |
| `rtiPdfFormat` / `rtiPdfType` / `rtiPdfGeneratedAt` | string | metadati PDF |
| `_modifiedBy` / `_lastModified` / `timestamp` / `created_at` | audit | |

**Esempio:**
```json
{
  "numero_rti": "CRTI-2025-003",
  "numero_ticket_collegato": "730/2025",
  "ticket_collegato": "ticket_<ts>",
  "tipo": "contabilizzazione",
  "stato": "definito",
  "cliente": "0671-034 - KARRIQI KELDI",
  "condominio": "CONDOMINIO PISCINA",
  "indirizzo": "LUNGO TANARO SAN MARTINO 39/43",
  "tecnico_intervento": "Dellafiore Lorenzo",
  "intervento_richiesto": "MOTIVO DELLA CHIAMATA: Contabilizzazione...",
  "intervento_effettuato": "DA CHIUDERE COME NON ESEGUITO - L'UTENTE NON ABITA PIÙ LÌ",
  "fatturabile": false,
  "materiali": []
}
```

**Relazioni:**
- `ticket_collegato` → `tickets.<id>` (1:1 tipicamente)
- `commessa` → `commesse.<numero>` (molti-a-uno)
- RTI → RTIDF: la duplicazione popola `rtidf.rti_origine_id = rti.id` e `rtidf.numero_rti_origine = rti.numero_rti`

---

### 1.2 `rtidf` — RTI Definitivo (snapshot fatturazione)

**Significato:** clone immutabile di un RTI, generato quando il rapporto è approvato per la fatturazione. Vive separatamente per non essere modificato.

**Sample doc id:** `CRTIDF-2025-004`, `GRTIDF-2025-201`

**Pattern ID:**
- `GRTIDF-YYYY-NNN` → RTI Definitivo generico (132 su ~195)
- `CRTIDF-YYYY-NNN` → RTI Definitivo contabilizzazione (59)
- `rtidf_<timestamp>` → rari (2)

**Distribuzione `stato`:**
| Stato | Count | Significato |
|---|---|---|
| `bozza` | 64 | appena duplicato |
| `definito` / `definitivo` | 33 + 48 | pronto per invio (nota: due label conviventi → **debito semantico**) |
| `inviato` | 40 | spedito all'amministratore |
| `fatturato` | 8 | incluso in una `commesse` |

**Distribuzione `tipo`:** `generico` 132 · `contabilizzazione` 61

**Campi principali:** superset di `rti` con in più:
| Campo | Tipo | Note |
|---|---|---|
| `numero_rtidf` | string | es. `CRTIDF-2025-004` |
| `tipo_documento` | string | letterale `"RTIDF"` |
| `rti_origine_id` | string | FK verso `rti.id` (o `numero_rti`) |
| `numero_rti_origine` | string | numero RTI sorgente |
| `costo_intervento` | int | importo (valore RTIDF) |
| `timestamp_duplicazione` | string ISO | quando è stato creato a partire dal RTI |

**Relazioni:**
- `rti_origine_id` / `numero_rti_origine` → `rti`
- `numero_ticket_collegato` / `ticket_collegato` → `tickets`
- `commesse.rtidf_ids[]` contiene i `numero_rtidf` inclusi nell'ordine cliente/fatturazione

---

### 1.3 `tickets` — Ticket assistenza

**Significato:** unità di lavoro lato cliente/amministrazione. Entry point per ogni intervento. Popolato da più canali.

**Sample doc id:** `gmail_generici_1757668000_337_0`, `gmail_contabilizzazione_1757684903_5`, `TEST-*`

**Distribuzione `stato`:**
| Stato | Count | Significato |
|---|---|---|
| `aperto` | 70 | |
| `pianificato` | 4 | intervento schedulato |
| `in_attesa` | 6 | |
| `da_chiudere` | 9 | intervento fatto, attesa chiusura |
| `chiuso` / `chiuso/inviato` | 2 + 409 | |

**Distribuzione `tipo`:** `generico` 421 · `contabilizzazione` 79

**Fonti (`fonte`):** `cosmina_email`, `gmail_contabilizzazione`, `gmail_generici` (da ID pattern)

**Campi principali:**
| Campo | Tipo | Note |
|---|---|---|
| `numero_ticket` | string | es. `1241/2025` |
| `data_apertura` / `data_chiusura` / `timestamp` | string | |
| `cliente` / `condominio` / `indirizzo` | string | denormalizzati |
| `datiAnagrafici` | map | snapshot anagrafica (`{cliente, indirizzo, condominio, data_apertura}`) |
| `tipo_contratto` | string | |
| `tecnico_anagrafica` | string | |
| `urgenza` | string | |
| `stato` | string | vedi sopra |
| `inArchivio` | bool | |
| `fonte` | string | canale origine |
| `aperto_da` / `aperto_il` / `pianificato_da` / `pianificato_il` | audit | |
| `rti_inviato` / `rtiChiusura` | string | FK verso `rti.numero_rti` |
| `email_originale` | map | email che ha generato il ticket |
| `pdf_originale` | map | PDF allegato originale |
| `hasPdf` | bool | |
| `email_chiusura_inviata` / `email_chiusura_timestamp` | audit invio email chiusura |
| `note` | string lungo | note libere |

**Subcollection trovata:**
- `tickets/<id>/attachments` — allegati del ticket (vista in `gmail_contabilizzazione_1757684903_5`)

**Relazioni:**
- `rti_inviato` / `rtiChiusura` → `rti.numero_rti`
- `tickets/<id>/attachments` (sub) → allegati

---

### 1.4 `pending_rti` — Buffer card Trello/Cosmina

**Significato:** staging area. Quando una card Trello della bacheca ACG viene "chiusa" (o arriva un evento da Cosmina), crea un record qui. Un processo la trasforma in RTI vero e proprio.

**Distribuzione `stato`:** tutti `processed` (84/84) → significa che la coda è stata smaltita, non rimane nulla in `pending`.

**Campi principali:**
| Campo | Tipo | Note |
|---|---|---|
| `origine` | string | `bacheca_cosmina`, `test_automatizzato`, ... |
| `board_id` / `id_card_trello` | string | riferimenti Trello |
| `titolo_card` / `descrizione_card` | string | contenuto card |
| `labels` | array<string> | tecnico assegnato + note es. `[DAVID, POMERIGGIO]` |
| `numero_ticket` | string | se associato |
| `codice_condominio` | string | codice (`F015`, `Z014`, ...) |
| `condominio` / `indirizzo` | string | |
| `tecnico` | string | |
| `ore` / `materiale` / `note_intervento` | string | campi estratti dalla card |
| `data_invio` / `processed_at` / `data_scadenza` / `created_at` | timestamp | audit |
| `rti_creato` | string | `numero_rti` prodotto (es. `GRTI-2026-112`) |
| `rti_id` | string | doc id RTI |
| `richiede_ordine` | bool | se serve un ordine materiale |
| `allegati` | array<map> | |
| `tipo_documento` | string | `generico` \| `contabilizzazione` |

**Relazioni:**
- `rti_id` / `rti_creato` → `rti`
- `numero_ticket` → `tickets.numero_ticket`

---

### 1.5 `commesse` — Commesse / ordini fornitore

**Significato:** ordine cliente/amministratore che raggruppa più RTIDF per fatturazione. Spesso popolato da parsing AI di PDF ordine.

**Campi principali:**
| Campo | Tipo | Note |
|---|---|---|
| `numero` / `numero_ordine` / `ordineCollegato` | string | es. `550/F` |
| `numero_fattura` | string | |
| `importo` / `importo_totale` | int | |
| `cliente` | string | |
| `stato` | string | `chiusa`, ... |
| `tipo` | string | `ordine_pdf` |
| `parsing_ai` | bool | flag se creato da AI parser |
| `pdf_url` | string | URL Firebase Storage (`ordini/...`) |
| `data_ordine` / `data_creazione` / `dataCreazione` / `dataCreazione_raw` | data varie | |
| `rtidf_ids` | array<string> | **FK multipla** verso `rtidf.numero_rtidf` |
| `rti` | array | (spesso vuoto, legacy?) |
| `note` | string | note libere |

**Relazioni:**
- `rtidf_ids[]` → `rtidf.numero_rtidf` (1 commessa → N RTIDF)

---

### 1.6 `mpls` — Multi-Preventivo Lavori Straordinari

**Significato:** offerte / preventivi per lavori fuori contratto (coibentazioni, sostituzioni tubazioni). Generati da upload PDF fornitore + calcolo margine.

**Pattern ID:** `MPLS-YYYY-NNN` (e `MPLS-YYYY-NNN-PREV` per preventivi)

**Campi principali:**
| Campo | Tipo | Note |
|---|---|---|
| `numero_mpls` | string | `MPLS-2025-001` |
| `cliente` / `condominio` / `indirizzo` | string | |
| `fornitore` | string | |
| `offerta_numero` / `offerta_data` / `offerta_totale` | string/float | dati offerta fornitore |
| `materiali` | array<map> | lista ricambi (`nome`, `prezzoAcquisto`, `um`, `quantita`) |
| `mpls` | map | sotto-blocco con `ore_manodopera`, `sovrapprezzo`, `oggetto`, `tecnico`, `data_intervento` |
| `iva_percentuale` | int | es. 10 |
| `risultatiCalcolo` | map | output calcolo (totale, margine, IVA, costi...) |
| `allegati` | array<map> | PDF offerta + altri (base64 inline) |
| `pdfOffertaFornitore` | map | PDF originale fornitore |
| `isGuazzotti` | bool | true se lavoro per Guazzotti Energia stessa |
| `status` | string | `bozza`, ... |
| `source` / `sourceFilename` / `emailMessageId` / `emailSubject` | tracciabilità origine email |

---

### 1.7 `pagamenti_clienti` — Esposizione creditoria corrente

**Significato:** stato attuale esposizione/scaduti per cliente. Aggiornato periodicamente (probabile import da contabilità).

**Sample doc id:** `0000000004`, `0000000006` (stringa a 10 cifre = `CodCliente` con padding)

**Campi principali:**
| Campo | Tipo | Note |
|---|---|---|
| `CodCliente` | string | codice a 10 cifre |
| `Cliente` | string | ragione sociale (es. `CENTRO RESIDENZIALE 2000`) |
| `Amministratore` | string | es. `STUDIO MAZZOCCHI & C SRL`, `NN` |
| `TotaleEsposizione` / `TotaleScaduto` | float/int | totali euro |
| `AScadere` | float/int | non ancora scaduto |
| `Scaduto30` / `Scaduto60` / `Scaduto90` / `Scaduto180` / `Scaduto360` / `ScadutoOltre360` | float/int | bucket aging |
| `scadutoPrecedente` | float/int | snapshot precedente per delta |
| `variazione` / `variazionePercentuale` / `statoVariazione` | calcolati | `stabile` / `in_aumento` / ... |
| `riskScore` / `riskLevel` / `riskColor` / `riskBgColor` | scoring | `MEDIO`/etc, colori HEX |
| `dataRiferimento` / `dataUltimoAggiornamento` | string | |
| `azioni` | array<map> | azioni di recupero intraprese |

---

### 1.8 `pagamenti_snapshots` — Snapshot storici mensili

**Significato:** archivio puntuale dell'esposizione (una istantanea per data).

**Pattern ID:** `snapshot_YYYY-MM-DD`

**Campi principali:**
| Campo | Tipo | Note |
|---|---|---|
| `dataRiferimento` / `data` / `dataTimestamp` | string | |
| `totaleClienti` | int | ~155 |
| `totaleEsposizione` / `totaleScaduto` | float | totali |
| `clienti` | array<map> | lista clienti con stessi campi di `pagamenti_clienti` (denormalizzato inline) |
| `riepilogo` | map | note, metadati |

**Relazioni:** gli elementi di `clienti[]` sono clonati da `pagamenti_clienti`, usano `CodCliente` come chiave logica.

---

### 1.9 `email_archive` e `email_logs`

- **`email_archive`**: archivio email uscenti (chiusura ticket), con `testoCompleto` HTML. Riferimenti: `ticketNumber`, `condominio`, `cliente`, `allegati` (tipi: `ticket_pdf`, `rti_pdf`).
- **`email_logs`**: log tecnico invii, riferimenti: `ticket_id`, `rti_id`, `numero_ticket`, `numero_rti`, `tipo` (`email_chiusura_ticket`), `status`.

Le due collection sono complementari: `email_archive` ha il **contenuto**, `email_logs` ha il **tracking**.

---

## 2. Collection CONFIG (singoletti)

### 2.1 `_counters`
- Doc: `rti_numbers` → `{GRTI-2026: 164, CRTI-2026: 34}`
- Pattern: `<PREFISSO>-<ANNO>: <ultimo numero usato>`

### 2.2 `emailConfig` — doc `chiusuraTicket` (typo originale)
- Destinatari e CC per **3 tipologie x 2 documenti** (RTI/RTIDF x generico/contabilizzazione) + tipo `mpls`
- Campi pattern: `{doctype}{Generico|Contabilizzazione}{Destinatario|CC}` + `generale`, `generico`, `contabilizzazione`, `mplsDestinatario`, `mplsCC`

### 2.3 `gmail_settings` / `guazzotti_config` (duplicati legacy)
⚠️ **SENSIBILE**: contengono Gmail app passwords in chiaro (`avxn jden rifm epvl`, `fmzs byra dzhs mhmc`).
- Credenziali email `generici` + `contabilizzazione`
- `gmailDaysBack`, `gmailAutoSync`, `gmailPostAction` (polling config)
- **Debito tecnico**: due collection per la stessa cosa. `gmail_settings/global_config` è il nuovo, `guazzotti_config/gmail_credentials` è legacy.

### 2.4 `notification_settings/global_config`
- Notifiche periodiche ticket aperti (generici + contabilizzazione)
- Campi: `frequenza`, `giorni_apertura`, `attiva`, `destinatari`, `ora_invio`, `includi_dettagli`

### 2.5 `whatsapp_config/global`
- Config webhook Meta (`phone_number_id`, `verify_token`, `webhook_url`)
- `trello_integration` (board `ACG - BACHECA` id `66c757ff386120ad8c3ffb9a`, list `GENERICO`)
- `claude_api` (modello, token, temperature)
- `routing` (`abilita_ai: true`, fallback, timeout)
- `limiti` (rate, blacklist)

⚠️ **Interessante**: il webhook punta a `garbymobile-f89ac.cloudfunctions.net`, non a Guazzotti. **Guazzotti TEC condivide la Cloud Function WhatsApp con il progetto garbymobile-f89ac** (cross-project). Da segnalare ai Colleghi.

### 2.6 `whatsapp_routing_rules`
- 2 regole entrambe `attiva=true, priorita=100` con stessi template (test duplicato?)
- Struttura: `condizioni` (orario, keywords, ai_classification) → `azione` (`crea_card_trello`) + `statistiche`, `opzioni`

### 2.7 `catalogoArticoli/default`
- Array `articoli` con `{codice, nome, prezzoAcquisto, id}`
- Esempi: `FILT-001`, `GAS-R410A`, `TERM-DIG`

### 2.8 `mplsContacts/contacts`
- Array `lista` con `{id, nome, email}` — rubrica destinatari offerte MPLS

### 2.9 `users`
⚠️ **SENSIBILE**: 4 utenti con **password in chiaro** (`acg`/`acg2024`, `admin`/`admin123`, ...). Campi: `username`, `password`, `type` (`ACG`), `created`, `updated`. Non usa Firebase Auth.

### 2.10 `ai_audit_log`
- Log di ogni interazione con l'agente AI interno dell'app
- Campi: `operation` (`QUESTION`, ...), `userId`, `params` (`message`, `intent`, `filesCount`), `result` (`success`, `message`, `data`), `timestamp`

### 2.11 `todo_tasks`
- Backlog feature/improvements interni
- Campi: `title`, `description`, `category` (`feature`/`improvement`), `priority`, `status` (`pending`/`completed`), `createdBy`, `completedBy`, audit

---

## 3. Grafo relazioni

```
                    ┌──────────────┐
                    │  _counters   │ (gen numerico GRTI/CRTI)
                    └──────────────┘
                           │
              ┌────────────┴─────────────┐
              │                          │
      ┌───────▼────────┐        ┌────────▼────────┐
      │  pending_rti   │─────► │      rti        │──────┐
      │ (bacheca/Trello)│       │  (bozza→def.)   │      │
      └────────┬───────┘        └────────┬────────┘      │
               │                         │               │
               │ numero_ticket           │ duplica       │ rti_inviato /
               ▼                         ▼               │ rtiChiusura
         ┌───────────┐              ┌─────────┐          │
         │  tickets  │◄─────────────│  rtidf  │          │
         │           │  ticket_     │(fatt.)  │          │
         │ /attach.  │  collegato   └────┬────┘          │
         └─────┬─────┘                   │               │
               │                         │ rtidf_ids[]   │
               │ (chiusura)              ▼               │
               │                   ┌─────────┐           │
               ▼                   │commesse │           │
         ┌───────────┐             └─────────┘           │
         │email_     │                                   │
         │archive/   │                                   │
         │_logs      │                                   │
         └───────────┘                                   │
                                                         │
    ┌────────────────────┐    ┌────────────────────┐    │
    │  pagamenti_        │    │  pagamenti_         │    │
    │  clienti           │    │  snapshots          │    │
    │  (corrente)        │    │  (storico mensile)  │    │
    └────────────────────┘    └────────────────────┘    │
         (stand-alone, link via Cliente/CodCliente)     │
                                                         │
    ┌────────┐  ┌──────────────┐  ┌────────────────────┘
    │  mpls  │  │ catalogoArt. │  │
    │ (prev.)│  │   (default)  │  │
    └────────┘  └──────────────┘  │
                                   │
    ┌─────────────────────┐        │
    │ CONFIG singletons   │        │
    │ emailConfig         │        │
    │ gmail_settings      │◄───────┘
    │ guazzotti_config    │
    │ notification_sett.  │
    │ whatsapp_config     │
    │ whatsapp_routing    │
    │ users               │
    │ mplsContacts        │
    └─────────────────────┘
```

**Flusso tipo "ticket chiuso":**
```
Email/PDF/Cosmina → ticket (aperto)
                    → [tecnico interviene]
                    → pending_rti (se da bacheca Trello)
                    → rti (bozza → definito) → email chiusura
                    → rtidf (duplicato definitivo) → invio amministratore
                    → commesse (include N rtidf_ids) → fatturato
                    → email_archive + email_logs (tracking invii)
```

---

## 4. Note operative per i Colleghi

1. **Due pattern di numerazione RTI** coesistono: `GRTI-*` (generico) e `CRTI-*` (contabilizzazione). Stesso per RTIDF. **Non** usare mai solo `numero_rti` per uniqueness tra tipi — serve anche `tipo`.
2. **Campo `stato` su RTIDF** ha due label per lo stesso concetto: `definito` (33) e `definitivo` (48). **Debito semantico** — normalizzare prima di aggregare.
3. **PDF embeddati in Firestore** (`rtiPdfContent` ~100KB) gonfiano i doc RTI/RTIDF → occhio a costi `read` se si fa un full-scan.
4. **`whatsapp_config` webhook punta a `garbymobile-f89ac`** — integrazione cross-progetto. La Cloud Function WhatsApp vive in ACG, non in Guazzotti.
5. **Duplicato legacy**: `gmail_settings/global_config` (nuovo) vs `guazzotti_config/gmail_credentials` (vecchio) — stesse credenziali. Il codice probabilmente legge uno dei due; verificare prima di deprecare.
6. **`users` NON usa Firebase Auth**: auth custom via Firestore con password in chiaro. Non è exposable senza layer di hash. ⚠️ **segnalato a `acg-security-check`**.
7. **`tickets/<id>/attachments`** è l'unica subcollection trovata in questo scan (campionato su `gmail_contabilizzazione_*`). Serve query nested per allegati.
8. **Contatori per anno**: quando si cambia anno (es. 2026→2027) bisogna aggiungere `GRTI-2027` e `CRTI-2027` in `_counters/rti_numbers` o il progressivo salta a 1 automaticamente (verificare logica app-side).
9. **`commesse.rtidf_ids`** usa `numero_rtidf` (es. `GRTIDF-2025-201`), NON `id` interno — attenzione quando si fa lookup inverso.

---

## 5. Metadati scansione

- **Tool:** `firebase_admin` Python 7.1.0 via ADC (`application_default_credentials.json`)
- **Script:** `/tmp/memo_scan_guazzotti.py` + `/tmp/memo_deepdive_guazzotti.py`
- **Output JSON grezzo:** `/tmp/guazzotti_schema.json` (60KB), `/tmp/guazzotti_deepdive.json` (2.5KB)
- **PII masking:** email → `***@***`, telefoni → `***PHONE***`, CF → `***CF***`, IBAN → `***IBAN***`. ⚠️ Attenzione: il regex `***PHONE***` ha matchato anche alcuni timestamp ISO (numero che inizia con `+` o sequenza di cifre) — non è un vero dato.
- **Deep-dive counts:** cap a 500 doc per distribuzione stati, 300 per pattern ID.
- **Limiti noti:**
  - Non ho scansionato ricorsivamente le sub-collection (solo spot-check su campionati)
  - I campi `rtiPdfContent` sono stati troncati in sample (non è utile averli completi)
  - Non ho confrontato con schema ACG (garbymobile-f89ac) — è un altro job per MEMO.

---

**Prossima scansione consigliata:** settimanale, o su trigger "memo aggiornati" di Alberto. Confronta `_counters/rti_numbers` e numero doc delle collection core per capire velocemente cosa è cambiato.
