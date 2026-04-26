# Analisi dev-request AQcVigv15fYK4W4gmmzP

**Origine:** segnalazione "bug_from_chat" dal bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_z0ki7yvimog4k2hi
**Data:** 2026-04-26 18:51 UTC
**Nota di Alberto:** (nessuna)

> Il template del file dev-request non riporta la conversazione. Letta da
> Firestore (`nexo_dev_requests/AQcVigv15fYK4W4gmmzP`).

## Conversazione segnalata

| ruolo | contenuto |
|---|---|
| ALBERTO | "che interventi aveva federico giovedì 23/04/2026?" |
| NEXUS | "Federico il 23/04/2026 non ha interventi." (stato: completata) |

## Verifica dei dati reali

Ho interrogato direttamente `bacheca_cards` su `garbymobile-f89ac` (25.774 cards totali, di cui 7.793 con `listName == "INTERVENTI"`).

**Federico, 23/04/2026** — esiste UN intervento:

```
card_1776698118299_hpmunu0k4
  due:        2026-04-23T12:00:00.000Z (= giovedì 23/04 alle 14:00 ora italiana)
  listName:   INTERVENTI
  techName:   FEDERICO
  stato:      chiuso
  inBacheca:  true
  boardName:  "ZZ000 - CLIENTI PRIVATI E GENERICI (INTERVENTI UNA TANTUM)"
  name:       "DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA - Intervento concluso DA DAVID IL 23/04/2026 ALLE ORE 16:59"
```

L'intervento è ad **ALESSANDRIA** (citato nel campo `name`, non in `boardName`), è **chiuso**, ed è stato concluso da **DAVID** ma assegnato a **FEDERICO** in `techName`.

Quindi la risposta NEXUS "Federico il 23/04/2026 non ha interventi" è **FATTUALMENTE SBAGLIATA**: l'intervento esiste, va trovato e mostrato.

## Diagnosi — cosa va storto

Il routing è andato bene fino al direct handler (l'intent persisto in `nexus_chat` mostra `intent.collega=ares, intent.azione=interventi_aperti, direct=true`). Quindi `handleAresInterventiAperti` è stato chiamato. Ma la risposta finale ("Federico **il** 23/04/2026 non ha interventi.") non corrisponde al template che il mio handler produce ("Federico **giovedì** 23/04/2026 non ha interventi."). Il "il" senza giorno della settimana è il pattern di Haiku, non dell'handler.

Questo suggerisce due possibili scenari:

### Scenario A — l'handler ARES è stato chiamato, ha visto 0 risultati, MA il rendering di Haiku è stato preferito
Il flusso `nexusRouter` (`projects/iris/functions/index.js:534-541`):
```js
const direct = await tryDirectAnswer(intent, userMessage, sessionId);
let finalContent = intent.rispostaUtente;
if (direct && !direct._failed) {
  finalContent = direct.content || finalContent;
  ...
}
```
Se `direct.content` è truthy, vince. Se è vuoto/null, vince `intent.rispostaUtente` di Haiku. La risposta osservata ("Federico il 23/04/2026 non ha interventi.") sembra di Haiku, quindi `direct.content` era vuoto.

Questo succede solo se l'handler ha ritornato un oggetto senza `content`. Improbabile col mio codice attuale (tutti i branch hanno `content`). Rimane però possibile un bug tra deploy precedente e quello attuale (versione vecchia in produzione).

### Scenario B — l'handler ARES è stato chiamato MA non ha trovato la card
Più probabile. La causa è il **limit della query Firestore senza ordinamento**:

`projects/iris/functions/handlers/ares.js:175-189`:
```js
let q = getCosminaDb().collection("bacheca_cards")
  .where("listName", "==", "INTERVENTI");
if (!range || tense !== "past") {
  q = q.where("inBacheca", "==", true);
}
q = q.limit(Math.max(limit * 3, 200));
snap = await q.get();
```

Per "che interventi aveva federico giovedì 23/04/2026?":
- `range` = giovedì 23/04 (presente)
- `tense` = "past" (per "aveva") → **non aggiunge** `inBacheca==true`
- `limit` = 200

Risultato: la query pesca i primi 200 record di `listName==INTERVENTI` ordinati per document ID Firestore (default), su 7.793 totali. **Probabilità che la card di Federico 23/04 sia nei primi 200**: ~2.5%. Molto probabilmente NO. Quindi il filtraggio in memoria (su `due`, `techName`, `citta`) parte da un sottoinsieme che non contiene la card cercata.

L'handler restituisce 0 risultati → "Federico giovedì 23/04/2026 non ha interventi.".

Il fatto che la frase finale visualizzata sia "il 23/04/2026" invece di "giovedì 23/04/2026" è secondario: la causa **vera** del bug è che la query Firestore non è in grado di trovare la card per via del limit non strutturato.

### Bug 3 (correlato) — il filtro città dovrebbe matchare anche nel name
La mia implementazione cerca città in `[boardName, desc, zona, workDescription, name]`. Il `name` di questa card contiene "ALESSANDRIA". Quindi se l'handler **avesse** visto la card e cercasse città="alessandria", la troverebbe. Ma in questa query Alberto NON ha specificato la città (`parseCittaIntervento → null`), quindi il problema non si manifesta qui. Però è documentato che il match nel `name` funziona.

### Bug 4 (correlato) — descrizione boardName poco utile
Anche se la card fosse trovata, il rendering produrrebbe "?, stato chiuso" perché `boardName` viene normalizzato `String(i.condominio||"?").replace(/^[A-Z0-9]+\s*-\s*/, "")` → "CLIENTI PRIVATI E GENERICI (INTERVENTI UNA TANTUM)". Per Alberto è informazione inutile. Andrebbe usato il `name` (o `workDescription`) come fallback per i ZZ000 (clienti privati).

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 175-189 | query Firestore bacheca_cards: `limit(max(limit*3, 200))` SENZA orderBy o filtri data → pesca un sottoinsieme casuale |
| `projects/iris/functions/handlers/ares.js` | 218-248 | filtro client-side su tecnico/range/città. Funziona solo se la card è nel sottoinsieme letto |
| `projects/iris/functions/handlers/ares.js` | 282-294 | template risposta "0 risultati" — ritorna content valido |
| `projects/iris/functions/handlers/ares.js` | 305-318 | template risposta "1 risultato" |
| `projects/iris/functions/handlers/ares.js` | 296-303 | renderLine: usa `i.condominio` (= boardName) e ignora `name`. Per ZZ000 il boardName è generico. |
| `projects/iris/functions/index.js` | 534-541 | dispatch `direct.content` vs `intent.rispostaUtente` |
| `context/memo-firestore-garbymobile.md` | 209-228 | schema bacheca_cards (campi disponibili) |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Query strutturata sulla data (S-M)
**Dove:** `ares.js:175-189`.
**Cosa fa:** quando c'è `range`, eseguire una query con filtro data esplicito invece di pescare 200 a caso. Strategia:

a) **Path veloce con tecnico + indice**: `where("listName","==","INTERVENTI").where("techName","==",tecnicoUpper).limit(200)`. La query con techName usa indice esistente (techName è ad alta cardinalità ma indicizzato implicitamente quando c'è uno `where` semplice). Filtra in memoria per `due` nel range.

b) **Path range data senza tecnico**: `where("listName","==","INTERVENTI").orderBy("due","desc").limit(500)`. Richiede indice composito `(listName, due)` ma è la query naturale per "interventi del giorno X".

c) **Path fallback**: query attuale + alza il limit a 2000. Costa di più ma garantisce coverage. Per 7.793 cards INTERVENTI è ancora gestibile (single get, ~3 sec).

**Decisione consigliata:** combinare (a) e (c). Quando c'è `tecnicoFilter`, fai prima la query (a) con `techName` esatto in MAIUSCOLO; se anche `range` è presente, OK il filtro client-side basta. Se nessun tecnico ma c'è range → query (b) con indice composito (creare l'indice una volta).

### 2) Stato passato → leggi anche fuori bacheca (S)
**Dove:** `ares.js`, già parzialmente implementato.
**Cosa fa:** già togli `inBacheca==true` quando `tense=="past"`. **Verifica nel deploy attuale** che questa logica sia attiva (la card target ha `inBacheca: true` quindi non avrebbe inciso, ma per richieste retroattive su mesi vecchi serve davvero rimuovere `inBacheca`).

### 3) Search nel `name` (e `workDescription`) anche senza filtro città (S)
**Dove:** `ares.js:render`.
**Cosa fa:** quando `boardName` è generico (regex `/^ZZ\d+/i` o "CLIENTI PRIVATI") usa `name` o `workDescription` come fallback nella riga di output. Esempio:

```js
const condDisplay = (() => {
  const board = String(i.condominio || "");
  if (/^ZZ\d+/i.test(board) || /CLIENTI\s+PRIVATI/i.test(board)) {
    return String(i.name || i.workDescription || "intervento privato").slice(0, 80);
  }
  return board.replace(/^[A-Z0-9]+\s*-\s*/, "").slice(0, 60);
})();
```

Risultato visibile per Alberto: "23/04/2026, DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA, stato chiuso, tecnico FEDERICO" invece di "23/04/2026, ?, stato chiuso, tecnico FEDERICO".

### 4) Fallback "ricerca espansa" quando 0 risultati su tecnico+range (S-M)
**Dove:** `ares.js`, prima di "no top".
**Cosa fa:** se la prima query ritorna 0 risultati ma c'erano filtri data/tecnico, fai un'**altra** query con SOLO `where("techName","==",tecnico)` e limit alto, poi filtra in memoria. Se ancora 0, ritorna "non trovato".

Questo è il cosiddetto "second attempt" che il system prompt Haiku già documenta in `nexus.js:203-211` ("regola sul non-arrendersi"). L'handler oggi non lo fa.

### 5) Indice composito Firestore (S, infra)
**Dove:** Firebase Console → garbymobile-f89ac.
**Cosa fa:** creare indice `(listName ASC, due DESC)` su `bacheca_cards`. Permette query range data efficienti senza limit insufficiente.

**Comando equivalente:**
```bash
firebase deploy --only firestore:indexes --project garbymobile-f89ac
```
con un'aggiunta a `firestore.indexes.json`. Però il file è in `acg_suite/` non in `maestro-bridge`, quindi richiede coordinamento (o aggiungere un override).

### 6) Diagnostica nella risposta vuota (S)
Quando 0 risultati, dichiarare quanti record sono stati esaminati e con quali filtri:
> "Non ho trovato interventi di Federico il 23/04/2026 (cercato in 200 record con listName=INTERVENTI). Vuoi che allargi la ricerca?"

Aiuta a capire se il problema è il dato mancante o la query troppo stretta.

### 7) Logging dettagliato handler ARES (S)
**Dove:** `ares.js`.
**Cosa fa:** `logger.info("ares query", { snapSize, items, tecnico, range, citta, top })`. Nei log Cloud Functions sarà ovvio se la query ha letto 200 record e ne ha filtrati 0 → "il limit è troppo stretto".

### 8) Test integrato per la card target (S)
**Dove:** nuovo `projects/iris/test-ares-federico-23apr.mjs`.
**Casi:**
1. "che interventi aveva federico giovedì 23/04/2026?" → ritorna 1 intervento (la card target).
2. "interventi di federico ad alessandria 23/04/2026" → ritorna 1 intervento (match su `name` che contiene ALESSANDRIA).
3. "interventi di federico oggi" → ritorna interventi di oggi (con cap inBacheca).
4. "interventi di federico la settimana scorsa" → ritorna i 17 della settimana scorsa.

## Rischi e alternative

### R1 — Query con `techName` case-sensitive
`techName` su `bacheca_cards` è UPPERCASE ("FEDERICO"). Se passo `tecnicoFilter.toLowerCase()` direttamente, il `where("techName","==","federico")` non matcha. Mitigazione: query con `tecnicoFilter.toUpperCase()`. Però l'utente potrebbe scrivere "Tosca Federico" → split: usa la prima parola ≥ 5 caratteri o testa entrambi.

### R2 — Indice composito da creare
Oggi non esiste; richiede deploy (~1 minuto). Su collection 25.774 cards la build dell'indice richiede ~10 minuti. Mitigazione: deploy programmato in finestra a basso traffico, fallback a query (a) tecnico+limit alto nel frattempo.

### R3 — `techName` può essere null se l'intervento è multi-tecnico
Schema `bacheca_cards`: `techName` (singolo) + `techNames` (array). Se è multi-tecnico, può esserci `techName=null` con `techNames=["FEDERICO","DAVID"]`. Query (a) con `where("techName","==","FEDERICO")` perderebbe questi casi. Mitigazione: doppia query (where techName + where techNames array-contains FEDERICO) e merge in memoria. Costo +1 read.

### R4 — La card target ha `name` lungo che si ripete in più campi
Es. "DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA - Intervento concluso DA DAVID IL 23/04/2026 ALLE ORE 16:59" — è prolisso. Render risposta NEXUS deve troncare a 80 char e magari pulire il suffisso "- Intervento concluso DA X IL Y" che è metadata, non contenuto.

### R5 — Bug del "il 23/04/2026" vs "giovedì 23/04/2026" da indagare a parte
La risposta osservata non sembra del mio handler: "il 23/04/2026" senza "giovedì" è pattern di Haiku. O c'è una versione precedente in produzione, o c'è un'altra strada di rendering. Da investigare: leggere i Cloud Function logs della call exact corrispondente al messaggio (timestamp 2026-04-26T18:51:55Z).

### Alternative scartate

- **A1: leggere TUTTI i 7.793 record ogni volta**: lento (~5-10s) e costoso, non serve quando bastano 500-1000 record con un buon filtro. Bocciato.
- **A2: caching dei risultati query in Firestore con TTL**: nice-to-have ma overkill per questo bug. Bocciato.
- **A3: full-text search via Algolia/Typesense**: out of scope. Bocciato.

## Effort stimato

**Totale: M (medium)** — 2-3 ore.

| Step | Effort |
|---|---|
| 1) query strutturata con `techName` + filtri data | M — 60' |
| 2) verifica logica `inBacheca` per tense=past | S — 10' |
| 3) render fallback su `name` per ZZ000 | S — 30' |
| 4) fallback "ricerca espansa" quando 0 risultati | S — 30' |
| 5) creazione indice composito | S — 15' (+ tempo build automatico) |
| 6) diagnostica "0 risultati" con conteggio scanned | S — 15' |
| 7) logging dettagliato | S — 10' |
| 8) test mirato sulla card target | S — 30' |
| Deploy + email + commit | S — 15' |

## Test di accettazione

1. **Caso reale di Alberto:** "che interventi aveva federico giovedì 23/04/2026?" → risposta deve contenere "DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA" o equivalente, stato `chiuso`.
2. **Filtro città implicito ("ad alessandria"):** "interventi di federico 23/04/2026 ad alessandria" → stesso intervento (match nel `name`).
3. **Senza tecnico:** "che interventi ci sono stati il 23/04/2026?" → ritorna 1 intervento (con tutti i tecnici, esce Federico).
4. **Tense passato include chiusi:** "interventi di david ieri" (con david=tecnico che ha chiuso il 23) → ritorna l'intervento (anche se assegnato in `techName=FEDERICO` ma chiuso da David nel `name`).
5. **Diagnostica:** quando 0 risultati, log Cloud Functions deve mostrare snapSize, range, items_pre_filter, items_post_filter.
