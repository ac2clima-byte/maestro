# Analisi dev-request Tsa4wB0LG6KfM57LKbuI

**Origine:** segnalazione "bug_from_chat" dal bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_g3n47p5umog2quns
**Data:** 2026-04-26 18:01 UTC
**Nota di Alberto:** "ricerca errata"

> Il file `tasks/dev-request-…md` è materializzato col template vecchio (senza
> conversation). Il contenuto reale è stato letto da Firestore
> (`nexo_dev_requests/Tsa4wB0LG6KfM57LKbuI`).

## Conversazione segnalata

| ruolo | contenuto |
|---|---|
| ALBERTO | "federico aveva venerdi un interventi ad alessandria?" |
| NEXUS | "Federico ha 3 interventi attivi:\n1. [15/09/2025] ZZ028 - CONDOMINIO GLICINI B - VIA TORINO, 10 - NI — aperto · tecnico FEDERICO\n2. [16/04/2026] G031 - CONDOMINIO MAJESTIC - VIA SANT'AMBROGIO 9 - — chiuso · tecnico FEDERICO\n3. [16/04/2026] M005 - CONDOMINIO SARA - VIA BARBIERI 15 - VOGHERA — chiuso · tecnico FEDERICO" |

## Diagnosi — cosa succede oggi

La frase "Federico aveva **venerdì** un intervento ad **Alessandria**?" contiene tre filtri:
1. **tecnico** = Federico
2. **data** = venerdì (= 2026-04-24, rispetto al messaggio del 2026-04-26 domenica)
3. **località** = Alessandria
4. (implicito) intervento **storico/passato**, anche se chiuso (Alberto chiede "aveva")

NEXUS applica solo il filtro 1. Gli altri tre vengono ignorati. Risultato:
- restituisce un intervento del **15/09/2025** (sette mesi prima del venerdì richiesto)
- restituisce due interventi del **16/04/2026** (giovedì, non venerdì)
- nessuno è ad Alessandria — uno è a Voghera, due senza località
- due hanno `stato: chiuso` ma vengono presentati sotto l'intestazione "interventi attivi"

I bug presenti:

### Bug 1 — Haiku non riconosce date relative diverse da "oggi/domani"
`projects/iris/functions/handlers/nexus.js:106-114` istruisce Haiku così:

> "interventi_aperti (parametri opzionali: {tecnico, data}). Se l'utente cita 'oggi' / 'domani' passa anche parametri.data."

Non esistono istruzioni per "ieri", "venerdì", "venerdì scorso", "lunedì prossimo", date assolute ("il 24 aprile"), né per intervalli ("la settimana scorsa"). Haiku probabilmente passa solo `parametri.tecnico="Federico"`.

### Bug 2 — l'handler ignora ogni filtro data che non sia "oggi"
`projects/iris/functions/handlers/ares.js:16-17`:

```js
const oggiFlag = /oggi|today|giorno/.test(JSON.stringify(parametri).toLowerCase())
  || /\boggi\b/.test(userMessage);
```

L'unico flag temporale è `oggiFlag`. Anche se Haiku passasse `parametri.data="2026-04-24"` o `parametri.giorno_settimana="venerdì"`, l'handler li scarterebbe. Il filtro `due` viene applicato (`ares.js:59-65`) **solo** quando `oggiFlag === true`.

### Bug 3 — nessun filtro località/zona
`projects/iris/functions/handlers/ares.js:4-118` non legge `parametri.zona`, `parametri.citta`, `parametri.localita`. Lo schema `bacheca_cards` (vedi `context/memo-firestore-garbymobile.md:215-228`) ha il campo `zona`, ma non viene mai interrogato. La città spesso compare dentro `boardName` o nel `desc`, mai filtrato.

Il system prompt Haiku (`nexus.js:105-114`) non menziona "zona/città" tra i parametri di `interventi_aperti`. Quindi Haiku non sa di poterlo passare e l'handler non saprebbe usarlo.

### Bug 4 — interventi chiusi mostrati come "attivi"
`projects/iris/functions/handlers/ares.js:44-45`:

```js
const stato = String(data.stato || "").toLowerCase();
if (stato.includes("complet") || stato.includes("annul")) return;
```

Il filtro scarta solo `completato` e `annullato`. Lo stato `chiuso` (presente nei dati: "[16/04/2026] … — chiuso · tecnico FEDERICO") **passa** il filtro. Ma per il memo (`memo-firestore-garbymobile.md:222`) gli stati validi sono `aperto, chiuso, ecc.` e il filtro storico era `stato != "completato"`. Però il memo a riga 213 dice esplicitamente:

> "Filtro per interventi aperti: `listName == 'INTERVENTI'` + `inBacheca == true` + `stato != 'completato'`."

Anche questo è incompleto: in pratica `chiuso` è a tutti gli effetti uno "stato terminale" come `completato`. La risposta poi etichetta tutto come "interventi attivi" (`ares.js:109`), che è bugiardo se metà sono chiusi.

### Bug 5 — l'handler interroga solo bacheca corrente, non il pregresso
`ares.js:21-25`:

```js
let q = getCosminaDb().collection("bacheca_cards")
  .where("listName", "==", "INTERVENTI")
  .where("inBacheca", "==", true)
  .limit(limit * 3);
```

Il filtro `inBacheca == true` esclude interventi archiviati. Per "Federico aveva venerdì un intervento" Alberto sta chiedendo del passato — può essere già archiviato. La risposta in questo caso ha pescato un intervento del 15/09/2025 perché evidentemente `inBacheca==true` non viene resettato dopo la chiusura, ma è incidentale.

### Bug 6 — formato risposta viola la regola NEXUS Chat
`projects/iris/functions/handlers/ares.js:98-102`:

```js
const lines = top.map((i, idx) =>
  `${idx + 1}. [${data}] ${i.condominio.slice(0, 50)} — ${i.stato} · ${tag}`).join("\n");
```

CLAUDE.md `Regole NEXUS Chat — FONDAMENTALI`:

> VIETATO: emoji, **bold**, bullet point (· o -), formato "campo: valore"
> OBBLIGATORIO: frasi complete come se parlassi a voce

Le liste numerate `1. … 2. … 3. …` con bullet `·` e separatore `—` sono formato robotico. La funzione `naturalize` (`shared.js:335-359`) rimuove `·` MA la riga 347 collassa solo bullet `·`/`•` e `-` a inizio riga; non smonta liste enumerate `1.`. Il `·` interno rimane come carattere a metà riga e non a inizio.

In effetti la risposta vista da Alberto contiene proprio "· tecnico FEDERICO" — il `·` non è stato rimosso perché non sta a inizio riga.

### Bug 7 (minore) — extractor tecnico fragile
`ares.js:11`:

```js
const m = userMessage.match(/\b(?:di|del|per)\s+([a-zà-ÿ]+)(?:\s|$|,|\?|!)/i);
```

Sulla frase di Alberto NON cattura "Federico" (nessun "di/del/per" prima del nome). Funziona solo se Haiku passa il tecnico in `parametri.tecnico`. In questo caso ha funzionato perché Haiku ha passato Federico, ma se Haiku sbagliasse l'estrazione il fallback regex non aiuterebbe.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 4-118 | `handleAresInterventiAperti`: nessun filtro per data ≠ oggi, nessun filtro località, lascia passare `chiuso`, query solo `inBacheca==true` |
| `projects/iris/functions/handlers/ares.js` | 16-17 | `oggiFlag` unico flag temporale supportato |
| `projects/iris/functions/handlers/ares.js` | 44-45 | filtro stato incompleto (`complet`/`annul` ma non `chiuso`) |
| `projects/iris/functions/handlers/ares.js` | 98-102 | render in formato lista numerata + `·` (viola NEXUS Chat) |
| `projects/iris/functions/handlers/nexus.js` | 105-114 | system prompt Haiku per ARES: parametri data limitati a "oggi/domani", nessuna località |
| `projects/iris/functions/handlers/nexus.js` | 415-421 | DIRECT_HANDLER regex per `handleAresInterventiAperti` (cattura il routing) |
| `projects/iris/functions/handlers/shared.js` | 335-359 | `naturalize`: non smonta liste enumerate, non rimuove `·` a metà riga |
| `context/memo-firestore-garbymobile.md` | 209-228 | schema `bacheca_cards`: `due, stato, techName, boardName, zona, archiviato, inBacheca` |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Estendere il parser data in ARES (M)
**Dove:** `ares.js`, prima della query.
**Cosa fa:** parser che converte stringhe italiane in un range `{from, to}`:
- "oggi" → [00:00 oggi, 00:00 domani)
- "ieri" → [00:00 ieri, 00:00 oggi)
- "domani" → [00:00 domani, 00:00 dopodomani)
- "lunedì/martedì/mercoledì/giovedì/venerdì/sabato/domenica" senza qualifier → giorno della settimana **più recente passato** se il messaggio usa il passato ("aveva", "ha avuto"), altrimenti il **prossimo futuro**
- "lunedì scorso", "venerdì scorso" → ultimo passato
- "lunedì prossimo" → prossimo futuro
- "il 24 aprile", "24/04", "24-04-2026" → data assoluta
- "questa settimana", "settimana scorsa" → range
- nulla → niente filtro (dafault: tutti gli interventi del tecnico, ordinati per data discendente, top 10)

**Nota tense detection:** "aveva" / "ha avuto" / "è stato" → cerca nel passato; "ha" / "ha oggi" / "domani avrà" → presente/futuro. È un'euristica imperfetta ma copre il caso reale.

**Pseudocodice:**
```js
function parseDataDaMessaggio(msg) {
  const m = msg.toLowerCase();
  const today = startOfDay(new Date());
  // assoluta dd/mm[/yyyy] o dd-mm[-yyyy]
  const abs = m.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (abs) { ... return { from, to: nextDay(from), label: "il 24/04" } }
  // giorno settimana
  const giorni = { domenica:0, lunedì:1, martedì:2, mercoledì:3, giovedì:4, venerdì:5, sabato:6 };
  for (const [name, idx] of Object.entries(giorni)) {
    const re = new RegExp(`\\b${name}\\b`, "i");
    if (!re.test(m)) continue;
    const wantPast = /\b(aveva|ha avuto|è stato|è andato|scors[oa])\b/.test(m)
                  || (!/\bprossim[oa]\b/.test(m) && [...untilToday]); // tense detection
    return { from: lastWeekday(today, idx, wantPast), to: ... };
  }
  if (/\boggi\b/.test(m))   return { from: today, to: nextDay(today) };
  if (/\bieri\b/.test(m))   return { from: prevDay(today), to: today };
  if (/\bdomani\b/.test(m)) return { from: nextDay(today), to: addDays(today, 2) };
  return null;
}
```

**Filtraggio in handler:**
```js
const range = parseDataDaMessaggio(userMessage);
if (range && due) {
  if (due < range.from || due >= range.to) return; // skip
}
```

### 2) Estendere il parser località (S)
**Dove:** `ares.js`, dopo il parser data.
**Cosa fa:** estrae da `userMessage` pattern come "ad/a/in/su [Città]" e lo confronta `boardName.toLowerCase().includes(citta)` o `desc.toLowerCase().includes(citta)` o `zona.toLowerCase().includes(citta)`.

```js
const locM = userMessage.match(/\b(?:ad|a|in|su)\s+(alessandria|voghera|tortona|novi(?:\s+ligure)?|casale|valenza|asti|milano|torino|...)\b/i);
const cittaFilter = locM ? locM[1].toLowerCase() : null;
```

**Filtraggio:**
```js
if (cittaFilter) {
  const hay = (data.boardName + " " + (data.desc || "") + " " + (data.zona || "")).toLowerCase();
  if (!hay.includes(cittaFilter)) return;
}
```

Lista città iniziale: Alessandria, Voghera, Tortona, Novi (Ligure), Casale (Monferrato), Valenza, Asti, Milano, Torino, Genova, Pavia. Da estendere mano a mano. (Alternativa: nessuna whitelist, prendere qualsiasi parola dopo "ad/a in" — più rumoroso, da scartare).

### 3) Aggiornare system prompt Haiku per ARES (S)
**Dove:** `nexus.js:105-114`.
Riformulare il blocco ARES così:

> `- ares       → interventi (bacheca COSMINA):
>     azioni: interventi_aperti (parametri: {tecnico, data, citta, stato_richiesto}),
>             apri_intervento, assegna_tecnico
>     parametri.data: passa "oggi", "ieri", "domani", o un giorno della
>       settimana ("lunedì", "venerdì"), o data assoluta "DD/MM[/YYYY]".
>       L'handler interpreta tense (aveva → passato, avrà → futuro).
>     parametri.citta: città citata dall'utente ("ad Alessandria",
>       "a Voghera"). Lascia vuoto se non c'è.
>     parametri.stato_richiesto: "tutti" se l'utente chiede di un giorno
>       passato (probabilmente vuole anche chiusi), "aperti" altrimenti.`

### 4) Filtro stato + label corretta (S)
**Dove:** `ares.js:44-45` e `:104-114`.

- Cambiare il filtro di default per escludere anche `chiuso`:
  ```js
  const STATI_TERMINALI = ["complet", "chius", "annul", "termin"];
  const isTerminal = STATI_TERMINALI.some(s => stato.includes(s));
  if (statoRichiesto === "aperti" && isTerminal) return;
  // se statoRichiesto === "tutti", non filtra → utile per "cosa ha fatto venerdì"
  ```
- Aggiornare l'header in modo che dica "interventi" e non "attivi" se include chiusi:
  ```js
  const verb = (statoRichiesto === "tutti") ? "ha" : "ha attivi";
  header = `${cap} ${verb} ${top.length} interventi${rangeLabel ? " " + rangeLabel : ""}${cittaLabel ? " a " + cittaLabel : ""}:`;
  // es. "Federico ha 1 intervento venerdì 24/04 a Alessandria:"
  ```

### 5) Risposta discorsiva, niente lista (S)
**Dove:** `ares.js:98-102`.
Se i risultati sono ≤ 2 → frase unica:
> "Sì, Federico venerdì 24 aprile aveva un intervento al Condominio La Bussola, Via Roma 12 a Alessandria. Era ancora aperto."

Se sono ≥ 3 → frase introduttiva + elenco prosa, niente numerazione né `·`:
> "Federico venerdì aveva tre interventi: uno al Condominio Glicini, uno al Majestic e uno al Sara. Tutti chiusi."

In nessun caso usare `1./2./3.` o `·`.

**Esito vuoto:** "No, Federico venerdì 24/04 non aveva interventi a Alessandria."

### 6) Hardening matching tecnico (S, opzionale)
Non bloccante, ma il regex `/\b(?:di|del|per)\s+([a-zà-ÿ]+)\b` può estrarre "alessandria" se la frase è "Federico ad Alessandria di venerdì". Aggiungere whitelist con i nomi dei 9 tecnici ACG (CLAUDE.md ha la lista) e fallback a Haiku se non c'è match.

### 7) Estendere `naturalize` per gestire enumerati (S, opzionale)
Aggiungere a `shared.js:naturalize`:
- `s = s.replace(/^\s*\d+\.\s+/gm, "")` per togliere "1. ", "2. " a inizio riga
- `s = s.replace(/\s·\s/g, ", ")` per sostituire `·` interno con virgola

**Caveat:** è una rete di sicurezza, non sostituisce la fix in handler. L'handler dovrebbe già produrre prosa, naturalize è solo l'ultimo filtro per handler non ancora migrati.

### 8) Test FORGE smoke (S)
Aggiungere in `test-*.mjs` o nel test runner FORGE:
- "federico aveva venerdì interventi a alessandria?" → handler deve tornare 0 risultati con label corretta, NO interventi di altre città/date
- "interventi di marco oggi" → 1 risultato se esiste oggi, altrimenti vuoto
- "interventi di lorenzo lunedì scorso a voghera" → handler combina i tre filtri
- "interventi di david il 24/04" → data assoluta

## Rischi e alternative

### R1 — Tense detection fragile
"aveva" non garantisce che si parli del passato (es. "Federico aveva oggi un intervento"). Mitigazione: priorità a parole-chiave esplicite ("ieri", "scorso", "scorsa", "passato"). Se ambiguo, default è "ultimo passato matching".

### R2 — Whitelist città troppo limitata
Se Alberto chiede di una città non in lista, il filtro non scatta. Mitigazione iterativa: log delle città richieste e non riconosciute, espandere whitelist. Alternativa: nessuna whitelist e match libero su qualsiasi parola dopo "ad/a/in" — rumoroso ma copre tutto.

### R3 — `bacheca_cards` schema disomogeneo
Il campo `boardName` è formato come "G031 - CONDOMINIO MAJESTIC - VIA SANT'AMBROGIO 9" — la città può essere assente, abbreviata ("NI" forse Novi?), o in qualsiasi posizione. Match con `.includes("alessandria")` può dare falsi negativi (es. abbreviazione "AL"). Mitigazione: provare anche match su `desc`, `zona`, e su una mappa abbreviazioni → città estesa ("AL" → "alessandria", "AT" → "asti", ecc.).

### R4 — Filtro `inBacheca == true` per richieste storiche
Se Alberto chiede "Federico cosa ha fatto venerdì scorso", interventi già archiviati (`inBacheca=false`) non compaiono. Questo è ortogonale ai filtri proposti, ma se `statoRichiesto === "tutti"` ha senso droppare il filtro `inBacheca` quando c'è un range data esplicito. **Decisione:** rimuovere `inBacheca==true` solo quando `range` è specificato — altrimenti la query torna troppo grande. Aggiungere `.where("due", ">=", range.from).where("due", "<", range.to)` per limitare il volume.

**Nota query Firestore:** `where("listName","==","INTERVENTI") + where("due", ">=", x) + where("due", "<", y)` richiede un **indice composito** se non esiste già. Fallback: query senza date e filtro client-side (ma con `limit` alto). Verificare in console Firebase prima di shippare.

### R5 — Naming "Federico" vs "Tosca Federico"
Memo CLAUDE.md riporta "Tosca Federico" come tecnico ufficiale, ma `techName` su `bacheca_cards` è uppercase "FEDERICO" (solo nome). Il filtro `includes(tecnicoFilter)` funziona già. Però se Haiku passasse "Tosca Federico" come `parametri.tecnico`, l'`includes("tosca federico")` fallirebbe contro "FEDERICO". Mitigazione: split del nome, fare include su qualsiasi token (≥3 caratteri).

### Alternative scartate

- **A1: chiamare un LLM (Haiku) come secondo passaggio per parsare i filtri.** Costa di più, lentissimo, e non è deterministico. Bocciato — il parser regex è sufficiente.
- **A2: mostrare comunque tutti gli interventi del tecnico e lasciare ad Alberto filtrare visivamente.** UX peggiore. La promessa di NEXUS è capire la domanda; tornare 3 risultati irrilevanti è fallimento.
- **A3: indice secondario per città.** Aggiungere un campo `citta_normalizzata` su `bacheca_cards` via trigger Cloud Functions. Bell'idea ma fuori scope (cambia schema condiviso). Bocciato per ora.

## Effort stimato

**Totale: M (medium)** — 3-5 ore.

| Step | Effort |
|---|---|
| 1) parser data + tense detection (incluso giorno settimana, "scorso/prossimo", date assolute) | M — 90' |
| 2) parser località + lista città piemonte/lombardia | S — 30' |
| 3) aggiornamento system prompt Haiku (parametri data/citta/stato_richiesto) | S — 15' |
| 4) filtro stato + label corretta nella risposta | S — 30' |
| 5) risposta discorsiva (no lista, no `·`) | S — 30' |
| 6) hardening tecnico (whitelist 9 nomi) | S — 15' |
| 7) hardening `naturalize` (rete di sicurezza) | S — 10' |
| 8) test FORGE smoke (4 query coperte) | S — 30' |
| Deploy + email report + commit | S — 10' |

Estensioni R3 (mappa abbreviazioni AL/AT/NO/PV/MI/TO) e R4 (rimozione `inBacheca==true` per range storici) restano follow-up: S+S = 60'.

## Test di accettazione

1. **Caso reale di Alberto:** "federico aveva venerdì un intervento ad alessandria?" → risposta NO (nessun match) o YES con dettaglio specifico se esiste su `bacheca_cards`. NON deve restituire interventi di altre città né date diverse.
2. **Filtro data presente:** "interventi di marco oggi" → solo `due == oggi`. Già funziona.
3. **Giorno settimana:** "interventi di lorenzo lunedì scorso" → solo lunedì 20/04/2026 (assumendo il messaggio del 26/04). Tense passato → ultimo lunedì.
4. **Combinazione:** "david martedì a tortona" → tecnico+giorno+città.
5. **Tutti gli stati:** se Alberto chiede di un giorno passato e ce ne sono di chiusi, deve ritornarli.
6. **Vuoto coerente:** "federico domenica a casale" → "Federico domenica non aveva interventi a Casale." (non "Federico ha 0 interventi attivi").
7. **Formato risposta:** nessun `1.`, `2.`, `·`, `**`, emoji.
