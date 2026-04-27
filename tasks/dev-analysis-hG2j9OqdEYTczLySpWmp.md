# Analisi dev-request hG2j9OqdEYTczLySpWmp

**Origine:** bottone globale "Segnala bug" (PWA top-right — `source: report_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** (n/a) — bottone globale non lega la richiesta a una sessione NEXUS.
**Data:** 2026-04-27 08:25 UTC (10:25 ora italiana, mattina)
**Type:** `generic`
**Richiesta:** "risposta errata"

> Il file dev-request non riporta la conversazione (è un report dal bottone
> globale). Ho ricostruito il contesto cercando in `nexus_chat` i messaggi
> di Alberto nei ~90 minuti precedenti la segnalazione.

## Conversazione ricostruita (sessione `nx_93o90ua2mogxlfyc`)

| ts | ruolo | content |
|---|---|---|
| 08:24:45 | ALBERTO | "interventi di oggi?" |
| 08:24:50 | NEXUS (ares/interventi_aperti) | "Nessun intervento oggi (cercato: filtro data oggi, solo aperti)." |

21 secondi dopo, Alberto va al bottone bug e scrive "risposta errata".

## Verifica dei dati reali (oggi 27/04/2026, domenica)

Scansione completa `bacheca_cards` su `garbymobile-f89ac` (25.780 cards): **11 interventi con `due` di oggi**:

```
LETTURE RIP        × 3  (LORENZO, condomini Sabina/Aida/Mazzini Broni)
INTERVENTI         × 7  (Federico/David/Marco/Antonio, vari condomini)
DA VALIDARE        × 1  (VICTOR, Condominio Giardino 3, RITORNO NON URGENTE)
```

Gli 7 con `listName="INTERVENTI"`:
- 1 chiuso (Federico, Condominio Elite Voghera, ore 06:51 — chiusura tardiva)
- **6 aperti** (David ×2, Marco ×1, Antonio ×2, ed altri — orari 06:00-07:00, presumibilmente avviati di mattina)

Quindi la risposta corretta sarebbe stata: **"Oggi ci sono 6 interventi aperti (escluse 3 LETTURE RIP e 1 DA VALIDARE)"**, non "Nessun intervento oggi".

## Diagnosi — perché NEXUS dice "Nessun intervento"

Dal payload Firestore del messaggio NEXUS (`direct.data.stats`):
```json
{
  "source": "byListName",
  "queries": [{"q": "listName==INTERVENTI", "count": 800}],
  "rawCount": 800,
  "federicoMatch": 0
}
```

L'handler `handleAresInterventiAperti` ha eseguito la query:
```js
cosm.collection("bacheca_cards")
  .where("listName", "==", "INTERVENTI")
  .limit(800)
```

**Recupera solo 800 cards** (su 7.793 totali con `listName==INTERVENTI`) ordinate per document ID Firestore (default, ≈ casuale). Le 7 card di oggi sono tra le **più recenti** (created_at recente, document ID più "lessicograficamente alto") e cadono fuori dal pool di 800 letti.

Probabilità delle 7 card di essere nei primi 800: ~10%. In pratica la query non le pesca quasi mai.

### Bug A — query senza orderBy né filtro data
È esattamente lo stesso problema diagnosticato in `dev-analysis-AQcVigv15fYK4W4gmmzP.md` per il caso "Federico 23/04 a Alessandria" — fixato per il branch `byTecnico` (con `where("techName","==",X)`), MA NON per il branch `byListName`. Quando NON c'è tecnico, l'handler ricade su `byListName` e il bug si manifesta.

`projects/iris/functions/handlers/ares.js:259-263`:
```js
} else {
  stats.source = "byListName";
  const q = cosm.collection("bacheca_cards")
    .where("listName", "==", "INTERVENTI")
    .limit(800);
  const s = await q.get();
  ...
}
```

Niente orderBy, niente filtro range data. Su 7.793 INTERVENTI legge 800 a caso.

### Bug B — listName troppo restrittivo
`_isListInterventi` (`ares.js:173-179`) accetta:
- `INTERVENT*` (catch-all per "INTERVENTI", "INTERVENTI DA ESEGUIRE", "Interventi da eseguire")
- `ACCENSIONE | SPEGNIMENTO`
- `TICKET DA CHIUDER`

**NON accetta**: `LETTURE RIP`, `DA VALIDARE`, `LETTURE CONTAKW CONTATORE GAS`, `OGGI`, `ARCHIVIO FATTURATO`, `ORDINI GUAZZOTTI DA RICHIEDERE`.

Per "interventi di oggi" Alberto si aspetta tutto il **lavoro di campo** programmato per oggi, incluse le letture ripartitori (3 di Lorenzo) e le validazioni (1 di Victor). Sono attività che i tecnici fanno fisicamente in giornata.

### Bug C — query `byListName` ignora ACCENSIONE/SPEGNIMENTO/TICKET
Anche se `_isListInterventi` poi accetterebbe `ACCENSIONE/SPEGNIMENTO`, la query Firestore in `byListName` filtra solo `listName==INTERVENTI` (exact match), quindi `ACCENSIONE/SPEGNIMENTO` non viene mai letta. Inconsistenza tra query Firestore e filtro client-side.

### Bug D — la risposta non spiega dove ha cercato
La risposta finale "Nessun intervento oggi (cercato: filtro data oggi, solo aperti)" omette informazioni utili:
- Quante card ho scansionato? (`rawCount=800`)
- Quale sottoinsieme di `listName`? (solo `INTERVENTI`, scartando 5 altri tipi rilevanti)
- Federico/David/altri tecnici sono assenti perché non trovati o perché tagliati dal limit?

### Bug E — comportamento divergente tra query con e senza tecnico
- "interventi di Federico oggi" → query `where("techName","==","FEDERICO")` (ben selettiva, ~261 card) + filtro client-side. **Funziona perché il pool è piccolo**.
- "interventi di oggi?" (senza tecnico) → query `where("listName","==","INTERVENTI").limit(800)` (insufficiente). **Non funziona**.

L'utente non sa di questa differenza interna. Si aspetta consistenza.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 259-263 | branch `byListName` con limit(800) senza orderBy né filtro data — **causa primaria** |
| `projects/iris/functions/handlers/ares.js` | 173-179 | `_isListInterventi` esclude LETTURE RIP / DA VALIDARE — **causa secondaria** |
| `projects/iris/functions/handlers/ares.js` | 305-330 | filtro client-side che richiede `_isListInterventi` true — perde le letture |
| `projects/iris/functions/handlers/ares.js` | 220-234 | branch `byTecnico` (funziona, è la query di confronto) |
| `acg_suite/COSMINA/firebase/firestore.indexes.json` | 4-9 | indice esistente `(stato, due)` su `bacheca_cards` — utilizzabile per range data |
| `acg_suite/COSMINA/firebase/firestore.indexes.json` | 12-17 | indice esistente `(archiviato, due)` |
| `tasks/dev-analysis-AQcVigv15fYK4W4gmmzP.md` | tutta | analisi del bug equivalente per "Federico 23/04" — fix riusabile |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Branch `byListName`: query con range data esplicito (M, critica)
**Dove:** `ares.js:259-263`.
**Cosa fa:** quando c'è `range`, sfruttare l'indice esistente `(stato, due)` per query selettiva:

```js
if (range) {
  const fromIso = range.from.toISOString();
  const toIso   = range.to.toISOString();
  // Strategia A: indice (stato, due) — se cerchi solo aperti
  if (!includeTerminali) {
    const q = cosm.collection("bacheca_cards")
      .where("stato", "==", "aperto")
      .where("due", ">=", fromIso)
      .where("due", "<",  toIso)
      .limit(500);
    const s = await q.get();
    stats.queries.push({ q: `stato=aperto + due range ${range.label}`, count: s.size });
    s.forEach(d => docs.set(d.id, d));
  } else {
    // Strategia B: leggi tutti gli stati nel range (richiede indice composito su due solo)
    const q = cosm.collection("bacheca_cards")
      .where("due", ">=", fromIso)
      .where("due", "<",  toIso)
      .limit(500);
    const s = await q.get();
    stats.queries.push({ q: `due range ${range.label}`, count: s.size });
    s.forEach(d => docs.set(d.id, d));
  }
} else {
  // Caso "ultimi interventi" senza filtro data: come oggi
  const q = cosm.collection("bacheca_cards")
    .where("listName", "==", "INTERVENTI")
    .limit(800);
  ...
}
```

Note: Firestore supporta `where("due", ">=", str)` su stringhe. Funziona con ISO format perché lessicograficamente ordinato.

L'indice `(due)` semplice serve se `includeTerminali=true`. È un indice single-field automatico — non serve dichiararlo.

### 2) Allargare `_isListInterventi` (S)
**Dove:** `ares.js:173-179`.
**Cosa fa:**
```js
function _isListInterventi(listName) {
  const ln = String(listName || "").toUpperCase();
  if (/INTERVENT/.test(ln)) return true;
  if (/ACCENSIONE|SPEGNIMENTO/.test(ln)) return true;
  if (/TICKET\s+DA\s+CHIUDER/.test(ln)) return true;
  // Letture ripartitori/contatori sono lavoro di campo per i tecnici
  if (/^LETTURE\b/.test(ln)) return true;
  // Da validare: tipicamente interventi rientrati che richiedono review
  if (/DA\s+VALIDARE/.test(ln)) return true;
  // OGGI: lista per programmazione giornaliera
  if (/^OGGI$/.test(ln)) return true;
  return false;
}
```

E aggiornare anche la query Firestore quando `byListName` (senza range): non più solo `listName==INTERVENTI` ma usare le altre liste con merge come abbiamo fatto per `byTecnico` (Promise.all).

### 3) Risposta diagnostica più informativa (S)
**Dove:** `ares.js`, ramo "no top".
**Cosa fa:** quando 0 risultati, dichiarare il dettaglio della scansione:
> "Oggi non vedo interventi (scansione 1240 card, filtro stato aperto, range 27/04 00:00 → 28/04). Vuoi che includa anche letture ripartitori e card chiuse?"

E quando ci sono risultati, raggruppare per `listName` se sono di tipo misto:
> "Oggi 11 interventi: 6 INTERVENTI aperti (David ×2, Marco, Antonio ×2, …), 3 LETTURE RIP (Lorenzo), 1 DA VALIDARE (Victor)."

### 4) Allineare branch `byTecnico` e `byListName` con stessa strategia data (S)
**Dove:** `ares.js:220-234` (`byTecnico`) e `:259-263` (`byListName`).
**Cosa fa:** entrambi i rami devono fare la stessa query con range data quando `range` è presente. Oggi solo `byListName` ha il limit problema, ma anche `byTecnico` può aggiungere `where("due", ">=", x).where("due", "<", y)` per essere più efficiente:

```js
// byTecnico con range:
let q1 = cosm.collection("bacheca_cards").where("techName", "==", tecnicoUpper);
let q2 = cosm.collection("bacheca_cards").where("techNames", "array-contains", tecnicoUpper);
if (range) {
  q1 = q1.where("due", ">=", fromIso).where("due", "<", toIso);
  q2 = q2.where("due", ">=", fromIso).where("due", "<", toIso);
}
q1 = q1.limit(200); q2 = q2.limit(200);
```

Richiede indici compositi `(techName, due)` e `(techNames, due)` da aggiungere a `firestore.indexes.json`.

### 5) Distinguere "no risultati" da "limit raggiunto" (S)
**Dove:** `ares.js`.
**Cosa fa:** se la query Firestore ritorna esattamente `limit` documenti, c'è il rischio di troncamento. Loggare e includere nel `stats.warning`:
```js
if (s.size >= 500) {
  stats.warning = "limit_hit";
  logger.warn("[ARES] query limit raggiunto, possibili risultati persi", { ... });
}
```
La risposta poi può dire: "Ho trovato 0 interventi aperti oggi, ma la scansione ha raggiunto il limite — provo a riformulare?"

### 6) Test integrato per "interventi di oggi" senza tecnico (S)
**Dove:** nuovo `projects/iris/test-ares-interventi-oggi.mjs`.
**Casi:**
1. "interventi di oggi?" → trova 6+ aperti del 27/04.
2. "tutti gli interventi di oggi" → trova 11 (incluso letture e da validare).
3. "interventi di oggi anche chiusi" → 11 (Federico ELITE incluso).
4. "interventi del 23/04 in tutta italia" → trova la card di Via Toscanini (regression test).

## Rischi e alternative

### R1 — Range data + stringhe ISO
`due` è memorizzato come **stringa ISO** in 96% dei record (vedi `dev-analysis-AQcVigv15fYK4W4gmmzP.md`). Confronti `where("due", ">=", iso)` funzionano per le stringhe (ordering lessicografico = cronologico per ISO 8601). Per il 4% di Timestamp, NON matchano la query stringa. Mitigazione: query stringa primaria + scan secondario per Timestamp se serve. In pratica i Timestamp sono record vecchi, irrilevanti per "oggi".

### R2 — Indice composito `(stato, due)`
Già esistente. Verifica con `firebase firestore:indexes`.

### R3 — Allargare `_isListInterventi` può aumentare rumore
Se Alberto chiede "interventi di oggi" e gli mostro 3 letture ripartitori che lui non considera "interventi", potrebbe dire "non sono interventi". Mitigazione:
- raggruppare per tipo nella risposta ("6 interventi + 3 letture + 1 da validare");
- offrire filtro: "interventi solo veri" → escluse letture/validazioni.

### R4 — Indice nuovo `(techName, due)` richiede deploy
Build prende 10-15 minuti per 25.780 card. Pianificare in finestra a basso traffico.

### R5 — `where("due", ">=", string)` su Firestore
Funziona, ma se ci sono record con `due` = `null` o `undefined`, NON sono inclusi automaticamente nel range. Conferma: tutte le card senza `due` valido sono già scartate dal filtro client-side `if (!due) return`.

### Alternative scartate

- **A1: aumentare il limit a 5000.** Costoso (5× read), non risolve veramente. Bocciato.
- **A2: scan tutta la collection client-side.** 25.780 letture ogni richiesta → costo Firestore proibitivo + lento. Bocciato.
- **A3: cache server-side dei "interventi di oggi" con TTL 5 min.** Buona idea ma overkill per il caso. Pianificabile se il volume di richieste cresce.

## Effort stimato

**Totale: M (medium)** — 2-3 ore.

| Step | Effort |
|---|---|
| 1) branch byListName con range data + indice (stato,due) | M — 60' |
| 2) `_isListInterventi` allargato + query Firestore parallela su altri listName | S — 30' |
| 3) risposta raggruppata per tipo | S — 30' |
| 4) allineare byTecnico con range data + indici tech/due | M — 45' |
| 5) detect limit-hit + warning | S — 15' |
| 6) test mirato "interventi di oggi" | S — 30' |
| Deploy + email + commit | S — 15' |

## Test di accettazione

1. **Caso reale di Alberto:** "interventi di oggi?" → "Oggi 6 interventi aperti: David ×2, Marco al Depretis, Antonio ×2, ... Vuoi che includa anche le 3 letture ripartitori di Lorenzo?"
2. **Inclusione letture:** "tutto il lavoro di oggi" o "interventi e letture oggi" → 9-10 card raggruppate per listName.
3. **Anche chiusi:** "interventi di oggi anche chiusi" → 11 card (incluso Federico Elite chiuso 06:51).
4. **Regression test (Federico 23/04):** continua a funzionare il caso fixato in precedenza.
5. **Diagnostica:** quando 0 risultati, log Cloud Function mostra `queries=[stato=aperto + due range, count=N]`.

## Nota operativa

Questo è il **terzo "stesso bug" identificato in 12 ore** (Tsa4wB0LG6KfM57LKbuI / 0YdtBOK9hBqJvYpkrWDd / AQcVigv15fYK4W4gmmzP / kqcLh2fkvTyokGBv2aqg). Il fix multi-tecnico già pushato in `7a153bd` ha risolto il branch `byTecnico` ma ha **lasciato intatto** il branch `byListName` che soffre dello stesso problema. È una regressione di scope: il fix era parziale.

Implementare gli step 1+2 (combinati ~90 min) chiude tutta la classe di bug "limit insufficiente sulla query Firestore". Step 4 (indici techName/due) è l'enabler per query future più mirate ma può aspettare.
