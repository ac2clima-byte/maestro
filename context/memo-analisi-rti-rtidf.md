# MEMO — Analisi RTI/RTIDF Guazzotti TEC (dati reali)

> **Responsabile:** MEMO
> **Project Firebase:** `guazzotti-tec`
> **Scansione:** 2026-04-21 18:37 UTC · rescan tipi 2026-04-21 20:45 UTC
> **Scope:** 584 RTI · 192 RTIDF · 84 pending_rti · 615 tickets — tutti letti
> **Script:** `scripts/memo_analisi_rti_rtidf.py` + `scripts/memo_analisi_tipi.py`
> **Export JSON:** `scripts/memo_analisi_rti_rtidf.json` + `scripts/memo_analisi_tipi.json`

Questo documento descrive lo **schema reale** (non ipotizzato), le **relazioni osservate** e propone una **lista alert** ordinati per impatto economico da implementare in PHARO.

⚠️ **IMPORTANTE — Esistono DUE tipi ortogonali di documento:**
- **G = Generico** (GRTI/GRTIDF) = intervento standard su impianto (riparazione/manutenzione). Origine: email o bacheca.
- **C = Contabilizzazione** (CRTI/CRTIDF) = lettura contatori + ripartizione UNI 10200. Origine: card Trello ACG.

I due tipi hanno **workflow, campi e origini diverse**. Gli alert vanno **separati per tipo**. Vedi §§ 8, 9, 10.

---

## 0. Executive summary (i numeri che contano)

| Metrica | Valore | Impatto |
|---|---:|---|
| **RTI 'definito' senza RTIDF da >7g** | **348** | 🔴 blocco fatturazione |
| **RTIDF 'inviato' pronti per fatturazione** | **41** | 🔴 ricavi bloccati |
| **RTIDF senza `costo_intervento` compilato** | **133** / 193 (69%) | 🔴 fattura non producibile |
| **Tickets aperti >30 giorni** | **94** / 119 aperti | 🟠 debito operativo |
| **Tickets aperti senza RTI collegato** | **117** / 119 aperti | 🟠 interventi non documentati |
| **Tickets chiusi senza RTI** | **88** / 495 chiusi | 🟠 non fatturabili |
| **RTI in bozza da >90 giorni** | **10** (top: 169g) | 🟠 rapporti dimenticati |
| **RTI con stato sconosciuto `da_verificare`** | **14** | 🟡 debito semantico |
| **RTI con `materiali` array vuoto** | **441** / 584 (75%) | 🟡 incompleti |
| **Tempo medio ticket aperto→chiuso** | 36.7g (mediana 19g, max 676g) | 🟡 benchmark |

**Priorità azione**: sbloccare i 41 RTIDF pronti per fatturazione e i 133 RTIDF senza costo ha impatto **diretto** sui ricavi correnti.

---

## 1. Schema reale `rti` (584 docs)

Campi osservati dai primi 20 documenti (con copertura statistica su tutti i 584):

| Campo | Tipo | Copertura | Note |
|---|---|---:|---|
| `_id` | string (auto-id o `numero_rti`) | 100% | doc ID Firestore |
| `numero_rti` | string | 583/584 | es. `GRTI-2026-012`, `CRTI-2025-003` |
| `id` | string | 19/20 | duplica `_id` o `numero_rti` (legacy) |
| `stato` | string | 100% | **7 stati diversi** (vedi §1.1) |
| `tipo` | string | 99% | `generico` (425), `contabilizzazione` (156) |
| `cliente` | string | 583/584 | ragione sociale |
| `condominio` | string | 19/20 | denominazione |
| `indirizzo` | string | 19/20 | |
| `telefono` | string | 19/20 (~55% vuoti) | |
| `tecnico_intervento` | string | 581/584 (20 vuoti) | nome tecnico |
| `tecnico` | string | **1/584** | legacy, quasi sempre assente |
| `ore_lavorate` | string | 581/584 (87 vuoti) | ore ma come stringa |
| `numero_operai` | string | 19/20 | contatore |
| `ora_intervento` | string | 19/20 (~50% vuoti) | HH:MM |
| `materiali` | list | 445/584 (**441 vuoti**) | 75% array vuoto! |
| `materiale_utilizzato` | string | 581/584 (**455 vuoti**) | testo libero, spesso vuoto |
| `intervento_richiesto` | string | 397/584 (187 assenti) | motivo chiamata |
| `intervento_effettuato` | string | 581/584 | descrizione (sempre compilata quando presente) |
| `fatturabile` | bool | 581/584 | |
| `fatturabile_modificato_il` | string ISO | 19/20 | audit |
| `commessa` | string | 19/20 (17 vuoti) | riferimento ordine fornitore |
| `note` | string | 19/20 (17 vuoti) | note libere |
| `data` | string | 1/20 | legacy |
| `data_documento` | string | 19/20 | quando generato |
| `data_intervento` | string (DD/MM/YYYY o ISO) | 580/584 | quando fatto intervento |
| `data_ticket` | string | 19/20 | data apertura ticket origine |
| `numero_ticket` | string | **2/584** | quasi sempre assente — usare `numero_ticket_collegato` |
| `numero_ticket_collegato` | string | 493/584 (126 assenti o vuoti) | FK logica verso `tickets` |
| `ticket_collegato` | string | 582/584 | FK doc ID verso `tickets` |
| `stato_modificato_il` | string ISO | 8/20 | audit cambio stato |
| `timestamp` | datetime/str | 100% | misto tipo (DatetimeWithNanoseconds + str) |
| `created_at` | DatetimeWithNanoseconds | 1/20 | raro, solo bozze nuove |
| `_modifiedBy` | string | 19/20 | audit utente |
| `_lastModified` | string ISO | 19/20 | audit timestamp |
| `descrizione` | string | 1/20 | legacy |
| `rtiPdfContent` | string (base64 ~100KB) | 11/20 (~55%) | PDF embedded in doc! |
| `rtiPdfFormat` / `rtiPdfType` / `rtiPdfGeneratedAt` | string | 11/20 | metadati PDF |
| `costo_intervento` | — | **0/584** | ❌ **MAI presente in RTI**, solo in RTIDF |

### 1.1 Stati RTI (reali, non ipotizzati)

```
definito          352  (60%)  ← chiuso dal tecnico, pronto per RTIDF
rtidf_presente    124  (21%)  ← già duplicato in rtidf
bozza              46   (8%)  ← editabile
rtidf_inviato      39   (7%)  ← RTIDF spedito amministratore
da_verificare      14   (2%)  ← ⚠️ NUOVO STATO non mappato prima
rtidf_fatturato     8   (1%)  ← incluso in una commessa
inviato             1  (<1%)  ← anomalia (1 solo doc, probabile errore dato)
```

> 🟡 **Debito semantico**: `da_verificare` è uno stato emerso solo ora. Probabilmente RTI con anomalie rilevate dal tecnico o dall'amministrazione. Va chiarito cosa lo causa.

### 1.2 Bozze (46 totali)

- **>7 giorni**: 43 (93% delle bozze)
- **>30 giorni**: 31 (67%)
- **>90 giorni**: 10 (22%)
- **Top 5 più vecchie** (169/144/144/144/124 giorni):
  - `CRTI-2026-001` (LORENZO, 169g)
  - `CRTI-2026-003`, `CRTI-2026-004`, `CRTI-2026-111` (LORENZO, 144g)
  - `CRTI-2026-005` (LORENZO, 124g)

> Il tecnico LORENZO domina le bozze vecchie. Probabile: rapporti aperti e non più chiusi.

### 1.3 Campi importanti mancanti/vuoti

| Campo | Vuoti | Assenti | Totale | % critica |
|---|---:|---:|---:|---:|
| `materiali` (array) | 441 | 139 | 580 | **75%** |
| `materiale_utilizzato` (testo) | 455 | 3 | 458 | **78%** |
| `numero_ticket_collegato` | 35 | 91 | 126 | 22% |
| `tecnico_intervento` | 20 | 3 | 23 | 4% |
| `ore_lavorate` | 87 | 3 | 90 | 15% |
| `intervento_richiesto` | 0 | 187 | 187 | 32% |
| `costo_intervento` | 0 | **584** | **584** | **100%** ⚠️ |

---

## 2. Schema reale `rtidf` (193 docs)

| Campo | Tipo | Copertura 20 samples | Note |
|---|---|---:|---|
| `_id` | string | 100% | pattern `GRTIDF-YYYY-NNN` o `CRTIDF-YYYY-NNN` |
| `numero_rtidf` | string | 100% | es. `CRTIDF-2025-048` |
| `numero_rti_origine` | string | 100% | **FK verso `rti.numero_rti`** (stabile) |
| `rti_origine_id` | string | 100% | **FK verso `rti._id`** (secondaria) |
| `numero_rti` | string | 1/20 | raro, legacy duplicato |
| `stato` | string | 100% | 5 stati (vedi §2.1) |
| `tipo` | string | 100% | `generico` 132 · `contabilizzazione` 61 |
| `tipo_documento` | string | 100% | sempre `RTIDF` |
| `cliente` / `condominio` / `indirizzo` / `telefono` | string | 100% | denormalizzati |
| `data_documento` / `data_intervento` / `data_ticket` | string | 100% | |
| `ora_intervento` | string | 100% (12/20 vuoti) | |
| `tecnico_intervento` | string | 100% | |
| `numero_operai` / `ore_lavorate` | string | 100% | |
| `intervento_effettuato` | string | 100% | |
| `intervento_richiesto` | — | **0/20** | ❌ non copiato da RTI! |
| `materiali` | list | 100% (**20/20 vuoti**) | array sempre vuoto |
| `materiale_utilizzato` | string | 100% (6/20 vuoti) | |
| `costo_intervento` | int | 100% (ma 133/193 totali con valore 0 o assente scan full) | **CAMPO CHIAVE FATTURAZIONE** |
| `costo_totale` | int | 1/20 | raro, legacy |
| `commessa` | string | 100% (**20/20 vuoti**) | legato solo se fatturato |
| `commessa_cliente` | string | 1/20 | raro |
| `fatturabile` | bool | 14/20 | |
| `numero_ticket_collegato` | string | 100% | FK verso `tickets.numero_ticket` |
| `ticket_collegato` | string/None | 100% (4/20 `None`) | FK verso `tickets._id` |
| `timestamp` | string | 100% | |
| `timestamp_duplicazione` | string ISO | 16/20 | quando è stato duplicato da RTI |
| `rtiPdfContent` / `rtiPdfFormat` / `rtiPdfType` / `rtiPdfGeneratedAt` | string | 10/20 | PDF embedded |
| `_lastModified` / `_modifiedBy` / `id` | audit | 100% | |
| `note` | string | 100% (17/20 vuoti) | |
| `descrizione_originale` | string | 1/20 | raro |

### 2.1 Stati RTIDF (reali)

```
bozza         64  (33%)  ← appena duplicato
definitivo    48  (25%)  ← (label 1 di 2) pronto invio
inviato       41  (21%)  ← spedito amministratore — ⚠️ CANDIDATI FATTURAZIONE
definito      32  (17%)  ← (label 2 di 2) pronto invio — debito semantico
fatturato      8   (4%)  ← incluso in commessa
```

> 🔴 **Debito semantico critico**: `definitivo` (48) e `definito` (32) sono lo stesso concetto ma con due label — già segnalato nel vecchio doc MEMO e ancora presente. Qualsiasi query/alert deve accettare entrambi.

### 2.2 Relazione RTI → RTIDF

**Chiavi testate:**
- `rtidf.numero_rti_origine` (100% popolato) → `rti.numero_rti` ✅ **usare questa come FK primaria**
- `rtidf.rti_origine_id` (100%) → `rti._id` — secondaria

**Orfani rilevati**: **8 RTIDF** non hanno RTI sorgente nella scan (es. `CRTIDF-2025-048`, `GRTIDF-2025-069`, `GRTIDF-2025-082`, `GRTIDF-2025-192`, `GRTIDF-2025-213`).
Possibili cause: RTI cancellato, duplicazione manuale con numero errato, scan cap 700 (ma rti=584 e rtidf=193 entrambi sotto cap, quindi non è limite di scan).

**Inverso (RTI senza RTIDF)**:
- RTI `stato=definito` senza RTIDF corrispondente: **350** (99% del totale `definito`)
- Di questi, con `data_intervento` > 7 giorni fa: **348** 🔴

### 2.3 Campi contabilizzazione

- `costo_intervento`: int, **presente in tutti i 20 sample**, ma su scan completo solo **60/193 (31%)** hanno valore non-zero. **69% degli RTIDF ha costo a 0 o mancante** → non fatturabili.
- `commessa`: vuota in 20/20 sample → popolata solo per i 8 `fatturato`.
- `materiali`: sempre array vuoto (20/20) → il campo non viene popolato nemmeno alla duplicazione.

---

## 3. Schema reale `pending_rti` (84 docs)

**Stato attuale**: tutti i 84 docs hanno `stato = processed`. **0 pending effettivi**.

La collection è quindi un **log storico** delle card Trello/Cosmina processate, non una coda live.

**Implicazione alert**: le regole sui "pending vecchi" al momento non scattano mai — ma la regola va mantenuta per quando arriveranno nuove card con `stato = pending`.

---

## 4. Schema reale `tickets` (615 docs)

### 4.1 Stati reali

```
chiuso/inviato      492  (80%)  ← label dominante per chiusura
aperto               79  (13%)
pianificato          19   (3%)
da_chiudere          13   (2%)
in_attesa             8   (1%)
chiuso                3  (<1%)  ← label alternativa (debito!)
affidato_energreen    1  (<1%)  ← ⚠️ NUOVO stato non mappato
```

> 🟡 **Debito**: `chiuso` e `chiuso/inviato` conviventi. `affidato_energreen` è un nuovo stato operativo (outsourcing esterno).

### 4.2 Aperti

- **Totale attivi** (aperto+pianificato+in_attesa+da_chiudere): **119**
- **>14 giorni**: 103 (87%)
- **>30 giorni**: 94 (79%)
- **Senza RTI collegato**: 117 (98%)

### 4.3 Chiusi senza RTI

**88 ticket** con stato `chiuso*` hanno né `rti_inviato` né `rtiChiusura` compilato. Questi sono interventi **conclusi ma non documentati** → non fatturabili.

### 4.4 Durata apertura → chiusura (calcolata su 492 ticket chiusi)

- Media: **36.7 giorni**
- Mediana: **19 giorni**
- Massima: **676 giorni** (quasi 2 anni — probabile dimenticato)

---

## 5. Lista alert suggeriti per PHARO (ordinata per impatto economico)

Ogni alert include: **nome**, **condizione**, **severità**, **query Firestore**, **cosa fare se scatta**.

### 🔴 Priorità 1 — Ricavi bloccati

#### A1. RTIDF pronti per fatturazione non inclusi in commessa
- **Severità**: `critical`
- **Condizione**: `rtidf.stato IN ('inviato','definitivo','definito') AND !commessa AND costo_intervento > 0`
- **Query**:
  ```js
  db.collection("rtidf")
    .where("stato", "in", ["inviato","definitivo","definito"])
    // filtro commessa/costo lato client perché Firestore non supporta != vuoto
  ```
- **Numero attuale**: ~41 (RTIDF inviati) + quota definitivi/definiti con costo
- **Impatto**: ricavi bloccati. Ogni RTIDF = 1 fattura mancante.
- **Azione**: notifica a CHARTA/ECHO (WA Alberto) con lista numeri RTIDF.

#### A2. RTIDF senza `costo_intervento`
- **Severità**: `critical`
- **Condizione**: `rtidf.costo_intervento IN (null, 0) AND stato != 'bozza'`
- **Query**:
  ```js
  db.collection("rtidf").where("stato", "!=", "bozza")
    // filtro costo client-side
  ```
- **Numero attuale**: ~133
- **Impatto**: documento non producibile → ricavo bloccato.
- **Azione**: notifica amministrazione (via ECHO email) per compilare costo.

#### A3. RTI 'definito' senza RTIDF da >7g
- **Severità**: `critical`
- **Condizione**: `rti.stato='definito' AND !esiste_rtidf_con_numero_rti_origine=rti.numero_rti AND data_intervento < NOW-7d`
- **Query**:
  ```js
  // 1) leggi rti where stato='definito'
  // 2) leggi tutti rtidf, indicizza per numero_rti_origine
  // 3) filtra rti non presenti nell'indice
  ```
- **Numero attuale**: **348**
- **Impatto**: rapporto chiuso ma snapshot fatturazione mai creato → fattura impossibile.
- **Azione**: scrivere Lavagna per ECHO WhatsApp ad Alberto + mostrare lista in PHARO UI.

### 🟠 Priorità 2 — Operatività / documentazione

#### A4. Ticket aperti da >30g senza RTI
- **Severità**: `critical`
- **Condizione**: `tickets.stato IN ('aperto','pianificato','in_attesa','da_chiudere') AND !rti_inviato AND !rtiChiusura AND data_apertura < NOW-30d`
- **Query**:
  ```js
  db.collection("tickets").where("stato", "in", ["aperto","pianificato","in_attesa","da_chiudere"])
  // filtro rti_inviato + data_apertura lato client
  ```
- **Numero attuale**: ~94
- **Impatto**: interventi in stallo → cliente insoddisfatto, possibile perdita contratto.
- **Azione**: Lavagna critical per ECHO WA Alberto, lista top 10 per PHARO.

#### A5. Ticket chiusi senza RTI
- **Severità**: `warning`
- **Condizione**: `tickets.stato CONTAINS 'chius' AND !rti_inviato AND !rtiChiusura`
- **Numero attuale**: 88
- **Impatto**: interventi fatti ma non documentati → non fatturabili retroattivamente.
- **Azione**: report settimanale CHARTA.

#### A6. RTI in bozza da >30 giorni
- **Severità**: `warning`
- **Condizione**: `rti.stato='bozza' AND data_intervento < NOW-30d`
- **Query**:
  ```js
  db.collection("rti").where("stato", "==", "bozza")
  // filtro data client
  ```
- **Numero attuale**: 31 (di cui 10 >90g)
- **Impatto**: rapporti dimenticati, rischio dimenticanza fatturazione.
- **Azione**: notifica al tecnico via ECHO WA (per LORENZO: 4 top bozze).

### 🟡 Priorità 3 — Debito dati / integrità

#### A7. RTIDF orfani (senza RTI sorgente)
- **Severità**: `warning`
- **Condizione**: `rtidf.numero_rti_origine NOT IN rti.numero_rti`
- **Numero attuale**: 8
- **Impatto**: rottura referenziale → impossibile risalire all'intervento.
- **Azione**: task di reconciliation manuale (email admin).

#### A8. RTI con stato non canonico `da_verificare`
- **Severità**: `info`
- **Condizione**: `rti.stato='da_verificare'`
- **Numero attuale**: 14
- **Impatto**: workflow non chiaro, possibile debito semantico.
- **Azione**: chiarimento con amministrazione, poi eventualmente normalizzare.

#### A9. RTI senza tecnico_intervento
- **Severità**: `info`
- **Condizione**: `rti.tecnico_intervento IN (null,'')`
- **Numero attuale**: 23 (4%)
- **Impatto**: dato incompleto, difficile assegnare responsabilità.
- **Azione**: report mensile DELPHI.

#### A10. Debito semantico RTIDF `definito` vs `definitivo`
- **Severità**: `info` (incident strutturale)
- **Numero attuale**: 32 `definito` + 48 `definitivo`
- **Impatto**: alert logica richiede sempre OR-match sui due valori. Rischio miss.
- **Azione**: migration one-shot per normalizzare su `definito` (o `definitivo`, scelta admin).

#### A11. Ticket con stato `affidato_energreen` non mappato
- **Severità**: `info`
- **Numero attuale**: 1
- **Impatto**: processo outsourcing emergente, non tracciato nel workflow standard.
- **Azione**: aggiornare mappa stati in PWA e handler PHARO.

---

## 6. Raccomandazioni implementative per PHARO

1. **Riordinare la lista `PHARO_RULES_DEFAULT`** nella PWA secondo la priorità economica di §5.
2. **L'handler `handlePharoRtiMonitoring`** già include A3, A4, A6, parte di A1 — va esteso con:
   - A1/A2 (check costo_intervento + commessa su RTIDF)
   - A5 (ticket chiusi senza RTI)
   - A7 (orfani RTIDF)
3. **Aggiungere al record `pharo_alerts`** un campo `impatto_economico: "ricavi_bloccati"|"operativo"|"dati"` per permettere al frontend di raggruppare visivamente.
4. **Normalizzare stati RTIDF**: prima di ogni alert, mappare `definito→definitivo` (o viceversa) lato handler.
5. **Cache invalidation**: lo scheduler gira ogni 6h. Valutare se ridurre a ogni 2h per gli alert critical (A1/A3/A4).

---

## 7. Metadati scansione

- **Tool**: `firebase_admin` Python 7.1.0 via ADC
- **SA**: user ADC (non SA Cloud Functions)
- **Script**: `scripts/memo_analisi_rti_rtidf.py`
- **Output JSON grezzo**: `scripts/memo_analisi_rti_rtidf.json`
- **Scan limit**: 700 docs per collection (tutti letti, nessun truncation)
- **Campi PDF non masked**: `rtiPdfContent` può pesare 100KB → occhio a costi read se scan full.

---

## 8. Segmentazione per tipo: Generico vs Contabilizzazione

### 8.1 Distribuzione

| Collection | Generico (G) | Contabilizzazione (C) | Ignoto |
|---|---:|---:|---:|
| `rti` | **427 GRTI** (73%) | **156 CRTI** (27%) | 1 |
| `rtidf` | **131 GRTIDF** (68%) | **61 CRTIDF** (32%) | 0 |

**Regola di classificazione osservata:**
- Prefisso `GRTI-` / `GRTIDF-` → generico
- Prefisso `CRTI-` / `CRTIDF-` → contabilizzazione
- Campo `tipo` coerente con prefisso (fallback: se `tipo` mancante usare prefisso)

**Cross-match**: **zero** GRTI→CRTIDF e zero CRTI→GRTIDF → **i due workflow sono completamente separati**. Una query sulla relazione deve sempre rispettare il tipo.

### 8.2 Workflow osservati (diversi per tipo)

#### GRTI (intervento generico)

```
Email cliente / PEC / bacheca  →  ticket (aperto)
                                   →  [tecnico interviene sul posto]
                                   →  GRTI (bozza → definito)
                                   →  GRTIDF (duplicazione)
                                   →  GRTIDF inviato al cliente via EMAIL (email_inviata=true)
                                   →  commessa/fatturazione via MPLS (ordine_riferimento)
```

**Segnali nei campi:**
- `email_destinatario`, `email_inviata`, `email_inviata_il`, `email_timestamp` presenti SOLO su GRTI/GRTIDF
- `ordine_riferimento`, `risultatiCalcolo`, `richiede_ordine`, `pending_rti_id`, `allegati` presenti SOLO su GRTIDF
- Stato più evoluto: bozza (1) → definito (291) → rtidf_presente (87) → rtidf_inviato (25) → rtidf_fatturato (8) + `da_verificare` (14)
- **Nessuna bozza vecchia** (solo 1 GRTI-2026-TEST, test artifact)

#### CRTI (contabilizzazione UNI 10200)

```
Card Trello ACG (bacheca)  →  pending_rti (processed)
                            →  CRTI (bozza → definito)
                            →  CRTIDF (duplicazione)
                            →  CRTIDF inviato all'amministratore
                            →  fatturazione condominiale ripartita
```

**Segnali nei campi:**
- `board_id`, `id_card_trello`, `materiale`, `ore`, `note_intervento` presenti SOLO su CRTI (copia da Trello)
- `graphNumber`, `graphPdfUrl`, `graphPdfGeneratedAt` → integrazione **GRAPH** (design system PDF)
- Stato semplificato: bozza (45) → definito (60) → rtidf_presente (37) → rtidf_inviato (14). **Nessun rtidf_fatturato** nei CRTI.
- **Bozze vecchie pesanti**: 45/46 totali sono CRTI (98%), 31 oltre 30 giorni, tutte di **Dellafiore Lorenzo**

### 8.3 Campi esclusivi per tipo

#### Esclusivi GRTI (non presenti in CRTI)
```
email_destinatario   email_inviata   email_inviata_il   email_timestamp   numero_ticket
```

#### Esclusivi CRTI (non presenti in GRTI)
```
board_id   id_card_trello   graphNumber   graphPdfGeneratedAt   graphPdfUrl
materiale   note_intervento   ore
```

#### Esclusivi GRTIDF (non presenti in CRTIDF)
```
allegati   board_id_origine   codice_condominio   data_fatturazione
email_destinatario   email_inviata   email_inviata_il   email_timestamp
graphDocumentNumber   graphNumber   graphPdfGeneratedAt   graphPdfUrl
labels_origine   ordine_riferimento   origine   pending_rti_id
richiede_ordine   risultatiCalcolo
```

#### Esclusivi CRTIDF
```
(nessuno — CRTIDF è sottoinsieme puro di GRTIDF)
```

### 8.4 Stati reali separati

| Stato | GRTI | CRTI | GRTIDF | CRTIDF |
|---|---:|---:|---:|---:|
| `bozza` | 1 | 45 | 19 | 44 |
| `definito` | 291 | 60 | 30 | 2 |
| `definitivo` | — | — | 47 | 0 |
| `rtidf_presente` | 87 | 37 | — | — |
| `rtidf_inviato` | 25 | 14 | — | — |
| `rtidf_fatturato` | 8 | 0 | — | — |
| `da_verificare` | 14 | 0 | — | — |
| `inviato` | 1 | 0 | 27 | 15 |
| `fatturato` | — | — | 8 | 0 |

**Letture chiave:**
- `da_verificare`: **esclusivo GRTI** — probabilmente rilevato dall'amministrazione su rapporti email anomali.
- **Nessun CRTIDF mai fatturato**: il workflow delle contabilizzazioni non arriva mai a `fatturato` (probabilmente fatturato a parte via competenze condominiali).
- **Label `definito` vs `definitivo` sul GRTIDF**: (47+30=77) — debito semantico è **solo sui generici**. I CRTIDF usano `definito` (2) in modo residuale.

### 8.5 Orfani per tipo

| Metrica | G (generico) | C (contabilizzazione) |
|---|---:|---:|
| RTI 'definito' senza RTIDF | **291 GRTI** | 60 CRTI |
| RTIDF orfani (RTI sorgente mancante) | 7 GRTIDF | 1 CRTIDF |

**Il problema dei 348 "RTI senza RTIDF"** emerso nel primo scan è **quasi tutto generico**: 291 GRTI vs 60 CRTI. Gli alert devono ordinarsi di conseguenza.

### 8.6 Valore economico fatturazione bloccata (da `rtidf.costo_intervento`)

| Tipo | RTIDF con costo>0 | RTIDF senza costo | Totale EUR potenziale | RTIDF 'inviato' (pronti fattura) | Valore 'inviato' EUR |
|---|---:|---:|---:|---:|---:|
| **GRTIDF** | 48 | 83 | **9.512 €** | 27 | **5.670 €** |
| **CRTIDF** | 13 | 48 | 434 € | 15 | 434 € |
| **TOTALE** | 61 | 131 | 9.946 € | 42 | **6.104 €** |

**Implicazione**: l'impatto economico del ritardo fatturazione è **dominato dal generico** (5670€ su 6104€ = 93%). Gli alert P1 devono targettizzare prima i GRTIDF inviati.

> ⚠️ Molti CRTIDF hanno `costo_intervento=0` perché le contabilizzazioni sono spesso servizi compresi nel canone condominiale o fatturati via ripartizione millesimi, non per singola prestazione. **L'alert "RTIDF senza costo" NON dovrebbe scattare sui CRTIDF**.

---

## 9. Alert ALERT per tipo (versione 2, sostituisce §5)

### 🔴 P1 — Ricavi bloccati (solo GENERICO)

#### A1-G. GRTIDF 'inviato' pronti fatturazione (non in commessa)
- **Condizione**: `rtidf.tipo='generico' AND stato IN ('inviato','definitivo','definito') AND costo_intervento>0 AND !commessa`
- **Severità**: `critical`
- **Numero attuale**: ~27 GRTIDF "inviato" = **5.670 €** pronti per fattura
- **Azione**: Lavagna critical → ECHO WA Alberto con lista numeri + totale EUR

#### A2-G. GRTIDF senza `costo_intervento`
- **Condizione**: `rtidf.tipo='generico' AND costo_intervento IN (null,0) AND stato != 'bozza'`
- **Severità**: `critical`
- **Numero attuale**: ~83 GRTIDF
- **Azione**: notifica amministrazione per compilare costo (via ECHO email).
- **NOTA**: questa regola **non vale** per CRTIDF.

#### A3-G. GRTI 'definito' senza GRTIDF da >7g
- **Condizione**: `rti.tipo='generico' AND stato='definito' AND !esiste_rtidf_con_numero_rti_origine=rti.numero_rti AND data_intervento<NOW-7d`
- **Severità**: `critical`
- **Numero attuale**: **291 GRTI** (massa principale del problema)
- **Azione**: Lavagna critical + UI PHARO lista

### 🟠 P2 — Workflow contabilizzazione (solo CONTABILIZZAZIONE)

#### A1-C. Bozze CRTI vecchie (backlog tecnico LORENZO)
- **Condizione**: `rti.tipo='contabilizzazione' AND stato='bozza' AND data_intervento<NOW-30d`
- **Severità**: `critical`
- **Numero attuale**: **31 CRTI bozza >30g** (top 5 tutti Dellafiore Lorenzo, 124-169 giorni)
- **Azione**: WA diretto al tecnico (via ECHO), CC Alberto. Escalation critica.
- **NOTA**: quasi tutti i CRTI bozza sono 2025 → probabile backlog incompleto dalle ultime letture annuali.

#### A2-C. CRTI 'definito' senza CRTIDF
- **Condizione**: `rti.tipo='contabilizzazione' AND stato='definito' AND !esiste_crtidf_con_numero_rti_origine=rti.numero_rti`
- **Severità**: `warning`
- **Numero attuale**: **60 CRTI**
- **Azione**: report amministrazione (meno urgente di A3-G perché la fatturazione contabilizzazione non è per singolo CRTIDF).

#### A3-C. CRTIDF 'inviato' vecchio
- **Condizione**: `rtidf.tipo='contabilizzazione' AND stato='inviato' AND timestamp_duplicazione<NOW-30d`
- **Severità**: `warning`
- **Numero attuale**: ~15 CRTIDF "inviato" (434 € — marginale economicamente)
- **Azione**: report mensile CHARTA per ripartizione condominiale.

### 🟠 P2 — Operativi (entrambi i tipi)

#### A4. Ticket aperti >30g senza RTI
- **Condizione**: `tickets.stato IN ('aperto','pianificato','in_attesa','da_chiudere') AND !rti_inviato AND !rtiChiusura AND data_apertura<NOW-30d`
- **Severità**: `critical`
- **Numero attuale**: ~94 ticket
- **NOTA**: i ticket NON hanno campo `tipo` → l'alert è indipendente dal tipo.

#### A5. Ticket chiusi senza RTI
- **Condizione**: `tickets.stato CONTAINS 'chius' AND !rti_inviato AND !rtiChiusura`
- **Severità**: `warning`
- **Numero attuale**: 88

### 🟡 P3 — Debito dati

#### A7-G. GRTIDF orfani (senza GRTI sorgente)
- **Numero attuale**: 7
- **Severità**: `warning`

#### A7-C. CRTIDF orfani (senza CRTI sorgente)
- **Numero attuale**: 1
- **Severità**: `info`

#### A8-G. GRTI stato `da_verificare`
- **Severità**: `info`
- **Numero attuale**: 14 (esclusivo generici)
- **Azione**: chiarimento workflow (nuovo stato non documentato).

#### A10-G. Debito semantico GRTIDF `definito` vs `definitivo`
- **Numero attuale**: 30 `definito` + 47 `definitivo` = 77 GRTIDF da normalizzare
- **Azione**: migration one-shot (decisione admin: scegliere label vincente).
- **NOTA**: **non applicabile ai CRTIDF** (usano solo `definito` con 2 doc).

---

## 10. Raccomandazioni implementative (aggiornate)

1. **Tutti gli handler PHARO** (`handlePharoRtiMonitoring`) devono **filtrare per `tipo`** e produrre metriche separate. Struttura consigliata:
   ```js
   out = {
     rti_generico: { total, bozza, definito, ... },
     rti_contabilizzazione: { total, bozza, ... },
     rtidf_generico: { total, inviato, ... },
     rtidf_contabilizzazione: { total, inviato, ... },
     // ...
   }
   ```
2. **Le regole P1 (ricavi)** devono targettizzare **solo il generico** (A1-G, A2-G, A3-G). Applicarle al contabilizzazione produce falsi positivi (es. CRTIDF senza costo è normale).
3. **Le regole contabilizzazione** (A1-C, A2-C, A3-C) sono meno urgenti economicamente ma importanti per la compliance UNI 10200 → priorità operativa.
4. **Il campo `tipo`** è affidabile al 99% (solo 1 UNK su 584 RTI). Usare `tipo` come filtro primario e prefisso numero come fallback.
5. **Per il ticket aperto >30g** (A4) il tipo è indifferente (i ticket non hanno `tipo`).
6. **Valore economico nella notifica**: per gli alert P1 generici, includere sempre il totale EUR bloccato (es. "5.670 €") → dà ad Alberto il peso decisionale immediato.

---

## 11. Metadati segmentazione tipi

- **Script**: `scripts/memo_analisi_tipi.py`
- **Output JSON**: `scripts/memo_analisi_tipi.json`
- **Scansione**: 2026-04-21 20:45 UTC
- **Metodologia classificazione**: campo `tipo` (primario) + prefisso numero (fallback)
- **Limitazione**: 1 RTI con `tipo` non classificabile (TEST artifact `GRTI-2026-TEST`)

---

## 12. Regole business e numeri ALERT corretti

### 12.1 Regole applicate (confermate da Alberto)

1. **Escludi già fatturati**:
   - RTI con `stato = rtidf_fatturato` → escluso da tutti gli alert
   - RTIDF con `stato = fatturato` → escluso da tutti gli alert
2. **Escludi non fatturabili**: `fatturabile === false` → escluso (interventi garanzia / cliente non reperibile / "non eseguito")
3. **CRTIDF senza `costo_intervento`** = **normale**, non è alert (ripartizione UNI 10200 millesimi)
4. **Bozze CRTI** restano alert valido (backlog tecnico)
5. **Ticket** non hanno campo `fatturabile` → filtro solo su stato+età

### 12.2 Distribuzione `fatturabile` per tipo

| Collection | fatturabile=true | fatturabile=false | missing |
|---|---:|---:|---:|
| GRTI (427) | ~140 | **281 (!)** | ~6 |
| CRTI (156) | ~130 | 19 | ~7 |
| GRTIDF (131) | ~82 | ~42 | ~7 |
| CRTIDF (61) | ~48 | ~13 | — |

> ⚠️ **Il 66% dei GRTI ha `fatturabile=false`**: è la norma operativa, non un'anomalia. Molti interventi sono di diagnostica / in garanzia / cliente assente / non eseguiti.

### 12.3 Numeri ALERT corretti (prima vs dopo i filtri business)

| Alert | Prima (falso positivo) | Dopo (reale) | Variazione |
|---|---:|---:|---|
| **A1-G** GRTIDF pronti fatturazione | 27 docs (5.670 €) | **28 docs (6.030 €)** | stabile — includeva già solo inviati |
| **A2-G** GRTIDF senza costo | 83 | **65** | −18 (bozze/fatturati esclusi) |
| **A3-G** GRTI definito senza GRTIDF | **291** 🔴 | **4** ✅ | **−287 (−99%)** |
| **A3-C** CRTI definito senza CRTIDF | 60 | **41** | −19 (non fatturabili esclusi) |
| **A1-C** Bozze CRTI >30g | 31 | 31 | invariato (bozze non hanno `fatturabile`) |
| **A2-C** CRTIDF senza costo | 48 | **RIMOSSO** | business rule: normale |

### 12.4 Impatto della correzione

**Prima**: la dashboard mostrava **291 GRTI senza GRTIDF** come problema critico → falso allarme, il 99% erano rapporti marcati esplicitamente come non fatturabili.

**Dopo**: solo **4 GRTI fatturabili davvero in attesa di GRTIDF**. Questo sì, è un problema reale e gestibile.

**Valore economico bloccato reale**: **6.030 €** su GRTIDF inviati fatturabili. Corrisponde al ritardo amministrativo di emissione fattura, non a un problema operativo esteso.

### 12.5 Aggiornamento handler

L'handler `handlePharoRtiMonitoring` (in `projects/iris/functions/index.js`) è stato aggiornato per:

- Classificare ogni RTI/RTIDF per `tipo` (generico/contabilizzazione) con fallback su prefisso numero
- Applicare filtro `fatturabile !== false` prima di conteggiare alert A1-G/A2-G/A3-G/A3-C
- Escludere stati `rtidf_fatturato` (RTI) e `fatturato` (RTIDF) dagli alert
- Non calcolare più CRTIDF senza costo (regola business)
- Esporre metriche separate `rti_gen`, `rti_con`, `rtidf_gen`, `rtidf_con` oltre agli aggregati legacy
- Nuovo blocco `alerts_metrics` con i 6 alert realmente attivi
- Nuovo blocco `business_rules` che documenta i filtri nel JSON response (trasparenza)

### 12.6 Script verifica

`scripts/memo_filtri_business.py` ricalcola tutti gli alert con i filtri business. Usarlo per validare le modifiche future all'handler Cloud Function.

Output JSON: `scripts/memo_filtri_business.json`.
