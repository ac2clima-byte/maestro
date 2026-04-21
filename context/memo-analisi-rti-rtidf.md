# MEMO — Analisi RTI/RTIDF Guazzotti TEC (dati reali)

> **Responsabile:** MEMO
> **Project Firebase:** `guazzotti-tec`
> **Scansione:** 2026-04-21 18:37 UTC
> **Scope:** 584 RTI · 193 RTIDF · 84 pending_rti · 615 tickets — tutti letti
> **Script:** `scripts/memo_analisi_rti_rtidf.py` · export JSON: `scripts/memo_analisi_rti_rtidf.json`

Questo documento descrive lo **schema reale** (non ipotizzato), le **relazioni osservate** e propone una **lista alert** ordinati per impatto economico da implementare in PHARO.

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
