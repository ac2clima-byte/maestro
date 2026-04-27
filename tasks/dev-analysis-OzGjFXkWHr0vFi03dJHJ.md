# Analisi dev-request OzGjFXkWHr0vFi03dJHJ

**Origine:** bottone 🐛 dentro la chat NEXUS (`source: nexus_chat_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** `nx_l4c2ibxcmoh7thuk`
**Data:** 2026-04-27 13:21 UTC
**Type:** `bug_from_chat`
**Nota di Alberto:** "SIAMO SICURI DI QUESTI 4 INTERVENTI?"

## Conversazione segnalata

Alberto, dopo il fix label-tecnici della scorsa iterazione, ha verificato:

| ts | ruolo | content |
|---|---|---|
| 13:10:52 | ALBERTO | "interventi di Marco oggi" |
| 13:10:59 | NEXUS | "Marco oggi ha un intervento il 27/04/2026: CONDOMINIO DEPRETIS - VIA SANT'AMBROGIO 17 - VOGHERA (PV), stato aperto (co-assegnato a LORENZO)." ✓ |
| 13:11:10 | ALBERTO | "E IERI AVEVA INTERVENTI?" |
| 13:11:16 | NEXUS | "Marco ieri ha avuto **4 interventi**.<br>26/04/2026, CONDOMINIO STELLA A, stato chiuso, tecnico MARCO<br>26/04/2026, CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA, stato chiuso, tecnico MARCO<br>26/04/2026, CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA, stato chiuso, tecnico MARCO<br>26/04/2026, CONDOMINIO CAPPUCCINI, stato aperto, tecnico MARCO" |

Alberto ha cliccato 🐛 con la nota "SIAMO SICURI DI QUESTI 4 INTERVENTI?" — vede 3 righe quasi identiche (Stella A) e dubita.

## Verifica dei dati reali

Le 4 card di Marco di ieri 26/04 sono **realmente 4 record distinti** in `bacheca_cards`, ma rappresentano **3 attività diverse** con un possibile duplicato:

### Card 1 — `card_1777212585124_aoc76al98` (sospetta duplicato)
```
listName:    INTERVENTI
boardName:   "CONDOMINIO STELLA A"   ← board name CORTO, manca codice V023 e indirizzo
name:        "Senza acs - Intervento concluso DA MARCO IL 26/04/2026 ALLE ORE 17:59"
due:         2026-04-26T14:00:00.000Z
stato:       chiuso
techName:    MARCO
labels:      [MARCO/sky, DA VALIDARE/purple]
workHours:   0.5
workDescription: "Ok"
closedAt:    2026-04-26T15:59:39.143Z
originalBoardId: 687f41e40e852bc11835d055   ← STELLA A board Trello
```

### Card 3 — `card_1777217264206_tg7kav057` (intervento vero Stella A)
```
listName:    INTERVENTI
boardName:   "V023 - CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA"   ← board name COMPLETO
name:        "Senza ACS - Intervento concluso DA MARCO IL 26/04/2026 ALLE ORE 18:01"
due:         2026-04-26T15:27:00.000Z
stato:       chiuso
techName:    MARCO
labels:      [MARCO/sky, POMERIGGIO/red, DA VALIDARE/purple]
workHours:   2.5
workDescription: "Tolto valvola sicurezza e installato valvola sfera lasciata leggermente aperta perché boiler bucato"
closedAt:    2026-04-26T16:01:08.862Z   ← 2 minuti dopo Card 1
originalBoardId: 687f41e40e852bc11835d055   ← STESSA STELLA A board Trello
```

**Card 1 vs Card 3**: stesso `originalBoardId` (Trello board STELLA A), nome simile ("Senza acs/ACS"), chiusi a 2 minuti di distanza. **Card 1 è una doppia chiusura/dato sporco**: workHours 0.5h e workDescription "Ok" sono inconsistenti col vero rapporto (Card 3, workHours 2.5h, descrizione tecnica dettagliata "Tolto valvola sicurezza..."). È plausibile che Marco abbia chiuso erroneamente una prima volta e poi riaperto/duplicato la card per scrivere il rapporto vero.

### Card 2 — `card_1777217239848_28md2sp7a` (Spegnimento, NON intervento)
```
listName:    ACCENSIONE/SPEGNIMENTO    ← categoria DIVERSA da INTERVENTI
boardName:   "V023 - CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA"
name:        "Spegnimento"
due:         2026-04-26T15:26:00.000Z   ← 1 minuto prima del vero intervento
labels:      [MARCO/sky]
```

Lo **spegnimento stagionale** dell'impianto Stella A. Operazione automatica che Marco fa quando va sul posto per l'intervento. È associata fisicamente all'intervento ma è una **card distinta di tipo diverso**.

### Card 4 — `card_1776871757722_v29pjt` (Cappuccini, intervento aperto distinto)
```
listName:    INTERVENTI
boardName:   "CONDOMINIO CAPPUCCINI"
name:        "RITORNO CONDOMINIO CAPPUCCINI - Perdita in CT"
due:         2026-04-26T15:29:17.722Z
stato:       aperto
labels:      [DA VALIDARE/yellow, GIALLO/yellow]   ← niente MARCO label!
techName:    MARCO
```

Card distinta: ritorno per perdita in centrale termica al Cappuccini, ancora aperta.

## Conclusione

**Marco ieri 26/04 ha avuto in realtà 3 attività distinte**:
1. **STELLA A intervento** (1 attività, 2 card duplicate per data sporca: Card 1 + Card 3)
2. **STELLA A spegnimento stagionale** (Card 2, categoria ACCENSIONE/SPEGNIMENTO)
3. **CAPPUCCINI ritorno** (Card 4, INTERVENTI, ancora aperto)

NEXUS dice "4 interventi" — formalmente corretto contando i record Firestore, ma **3 problemi di comunicazione**:

### Bug A — manca dedup di card duplicate stesso intervento
Card 1 e Card 3 sono lo stesso intervento Stella A. Identificabile da:
- Stesso `originalBoardId` (board Trello)
- `due` molto vicini (14:00 e 15:27)
- `closedAt` a 2 minuti di distanza
- `name` praticamente identico ("Senza acs - Intervento concluso DA MARCO IL 26/04/2026 ALLE ORE …")
- workHours sospetto: una card 0.5h, l'altra 2.5h → la card "leggera" è probabilmente errore.

NEXUS le mostra come 2 righe distinte. Alberto vede 2 cose dove c'è 1 intervento.

### Bug B — render fonde categorie diverse senza distinzione
La card 2 ha `listName="ACCENSIONE/SPEGNIMENTO"` e `name="Spegnimento"`. Il render attuale mostra:
> "26/04/2026, CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA, stato chiuso, tecnico MARCO"

(stessa stringa della Card 3) — perché il rendering usa solo `boardName`, non `name`. Per Alberto la riga è identica alla Card 3 → confusione.

Inoltre `_isListInterventi` accetta sia `INTERVENTI` sia `ACCENSIONE/SPEGNIMENTO`, ma il render non distingue — sarebbe meglio etichettare "1 intervento + 1 spegnimento + 1 ritorno" invece di "4 interventi".

### Bug C — nessuna nota di anomalia
Quando il sistema vede **2 card stessa board, stesso techName, closedAt vicinissimi** dovrebbe sospettare un duplicato e dirlo:
> "Stella A: 1 intervento (chiuso ore 18:01, 2.5h, Marco). Una seconda card è stata chiusa subito dopo con dati incompleti — possibile duplicato."

Oggi NEXUS mostra entrambe come righe a sé, perdendo segnale.

### Bug D — nome card ricco non valorizzato
`name="Senza ACS - Intervento concluso DA MARCO IL 26/04/2026 ALLE ORE 18:01"` contiene info utile ("Senza ACS" = senza acqua calda sanitaria, descrizione del problema). Il render mostra solo `boardName`. Per condomini grandi (ZZ000 PRIVATI o board generici) abbiamo già il fallback su `name`, ma per board normali no.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | ~340-380 | branch render `top.length > 1`: usa solo `boardName` per riga, perde tipologia/name |
| `projects/iris/functions/handlers/ares.js` | `_isListInterventi` | accetta INTERVENTI + ACCENSIONE/SPEGNIMENTO insieme senza distinguere |
| `projects/iris/functions/handlers/ares.js` | dopo filtri client-side | manca dedup post-filtraggio per `originalBoardId` + `closedAt` vicini |
| `context/memo-firestore-garbymobile.md` | 215-228 | schema `bacheca_cards`: documentare che `originalBoardId` è la "board Trello" (stesso board → stesso intervento fisico) |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Dedup euristico per duplicati stesso intervento (M, alta priorità)
**Dove:** `ares.js`, dopo i filtri client-side prima del sort.
**Cosa fa:** raggruppa le card per chiave `(originalBoardId, dueDate, techName)`. Se più card cadono nello stesso gruppo:
- mantieni solo quella con `workHours` più alto (rapporto vero) o quella con `workDescription` più lungo;
- segnala in `data.duplicates: [{kept, dropped}]` per debug.

```js
function _dedupSameIntervention(items) {
  const buckets = new Map();
  for (const i of items) {
    const dueDay = i.due ? i.due.toISOString().slice(0,10) : "?";
    // Chiave: stessa board Trello, stesso giorno, stesso tecnico primario
    const key = `${i.originalBoardId || i.id}|${dueDay}|${(i.techPrimary || "").toUpperCase()}`;
    const ex = buckets.get(key);
    if (!ex) { buckets.set(key, [i]); continue; }
    ex.push(i);
  }
  const kept = [];
  const dropped = [];
  for (const group of buckets.values()) {
    if (group.length === 1) { kept.push(group[0]); continue; }
    // Sort: workHours desc, workDescription length desc, closedAt più recente
    group.sort((a, b) => {
      const wha = Number(a._raw?.workHours || 0), whb = Number(b._raw?.workHours || 0);
      if (whb !== wha) return whb - wha;
      const wdLa = String(a._raw?.workDescription || "").length;
      const wdLb = String(b._raw?.workDescription || "").length;
      if (wdLb !== wdLa) return wdLb - wdLa;
      return (b._raw?.closedAt?.toMillis?.() || 0) - (a._raw?.closedAt?.toMillis?.() || 0);
    });
    kept.push(group[0]);
    for (const d of group.slice(1)) dropped.push({kept: group[0].id, dropped: d.id});
  }
  return { kept, dropped };
}
```

Salvare in `data.deduplicated: dropped.length` così NEXUS può dire "ho dedotto 1 duplicato".

**Nota:** richiede di mantenere `_raw` (riferimento al data Firestore originale) o di salvare `originalBoardId/workHours/workDescription/closedAt` nel pacchetto items.

### 2) Render distingue per tipo card (S, alta priorità)
**Dove:** `ares.js` renderLine.
**Cosa fa:** usa il `listName` e `name` per chiarire la tipologia:

```js
const renderLine = (i) => {
  const data = i.due ? i.due.toLocaleDateString("it-IT") : "n.d.";
  const ln = String(i.listName || "").toUpperCase();
  // Etichetta tipologia
  let tipo;
  if (/INTERVENT/.test(ln)) tipo = "intervento";
  else if (/ACCENSIONE/.test(ln)) tipo = "accensione";
  else if (/SPEGNIMENTO/.test(ln)) tipo = "spegnimento";
  else if (/TICKET/.test(ln)) tipo = "ticket";
  else if (/LETTUR/.test(ln)) tipo = "lettura";
  else tipo = "card";
  const board = String(i.condominio || "").trim();
  // ...
  // Per ACCENSIONE/SPEGNIMENTO usa name che è "Spegnimento"/"Accensione"
  let titolo;
  if (tipo === "spegnimento" || tipo === "accensione") {
    titolo = `${tipo} ${board || i.name}`;
  } else {
    titolo = board.replace(/^[A-Z0-9]+\s*-\s*/, "").slice(0, 70);
  }
  // ...
  return `${data}, ${titolo}, stato ${i.stato}, ${tag}`;
};
```

E nell'intro raggruppa: "Marco ieri ha avuto 2 interventi e 1 spegnimento" invece di "4 interventi".

### 3) Sintesi raggruppata per tipologia (S)
**Dove:** `ares.js`, costruzione intro per `top.length > 1`.
**Cosa fa:** conta le card per tipo e descrive in italiano naturale:

```js
const byTipo = {};
for (const i of top) {
  const ln = String(i.listName || "").toUpperCase();
  let t = "intervento";
  if (/ACCENSIONE/.test(ln)) t = "accensione";
  else if (/SPEGNIMENTO/.test(ln)) t = "spegnimento";
  else if (/TICKET/.test(ln)) t = "ticket";
  else if (/LETTUR/.test(ln)) t = "lettura";
  byTipo[t] = (byTipo[t] || 0) + 1;
}
// Output: "Marco ieri ha 2 interventi, 1 spegnimento e 1 lettura."
```

### 4) Segnala duplicati nella risposta (S)
**Dove:** dopo il dedup (step 1), aggiungi alla risposta:
> "Nota: una card è stata trattata come duplicato (chiusa 2 minuti dopo con workHours 0.5 e workDescription 'Ok')."

Aiuta Alberto a capire perché vede meno righe del previsto.

### 5) Centralizzare la definizione "card duplicata" (S, follow-up)
**Dove:** `shared.js` come `cardDuplicateGroupKey(card)` esportata.
**Cosa fa:** stessa logica per altri handler (PHARO, MEMO) che potrebbero raggruppare card. Già nel TODO della scorsa iterazione (centralizzare logica MEMO).

## Rischi e alternative

### R1 — Dedup nasconde card legittime
Se due interventi reali sullo stesso condominio nello stesso giorno (raro ma possibile: caldaia + sanitario) hanno stesso `originalBoardId`, il dedup li unisce. Mitigazione: includere nel key anche **fascia oraria** (mattina/pomeriggio) o usare `due` con tolleranza di ±1h. Se workHours sommati raggiungono cifre realistiche (>1.5h totale), conserva entrambi.

### R2 — Card 1 con workHours 0.5 potrebbe essere reale
Tecnico potrebbe aver fatto un sopralluogo veloce (0.5h) E un intervento (2.5h) sullo stesso condominio. Mitigazione: il dedup è euristico — se l'utente vuole vedere comunque i duplicati, esporre opzione "anche duplicati":
> "Marco ieri 2 interventi (1 dedotto come duplicato). Vuoi vedere tutti i record bacheca?"

### R3 — Card di tipo "ACCENSIONE/SPEGNIMENTO" nel filtro stato terminale
Le accensioni/spegnimenti sono **sempre chiuse** subito dopo l'esecuzione. Se filtro `stati_terminali` è attivo (richiesta query attuale), vengono escluse. Per "interventi di ieri" con tense="past" includiamo già i terminali → OK.

### R4 — `originalBoardId` può essere null per card create direttamente in COSMINA
Se non c'è Trello sync, `originalBoardId` è null/undefined. Il dedup non funziona. Mitigazione: fallback su `boardName` normalizzato (rimuovi prefisso codice "V023 - ") + due-day + techName.

### Alternative scartate

- **A1: rifiutare card con workHours < 0.5 e workDescription="Ok"**: troppo aggressivo, alcuni interventi rapidi sono reali.
- **A2: dedupe automatico su `name` similar**: difficile perché i name contengono timestamp specifici ("ALLE ORE 17:59" vs "ALLE ORE 18:01"), Levenshtein distance non triviale.
- **A3: chiedere a Trello sync di NON creare card duplicate**: richiede modifica al worker COSMINA (`acg_suite/COSMINA/cosmina_worker.py`) — fuori scope di questo fix immediato.

## Effort stimato

**Totale: M (medium)** — 90-120 minuti.

| Step | Effort |
|---|---|
| 1) dedup euristico per `originalBoardId + dueDay + tech` | M — 45' |
| 2) render distingue listName (intervento/spegnimento/lettura) | S — 20' |
| 3) intro raggruppata per tipologia | S — 15' |
| 4) segnalazione duplicati in risposta | S — 15' |
| 5) centralizzare in shared.js | S — 15' (follow-up) |
| Test FORGE: "interventi di Marco ieri" → "2 interventi + 1 spegnimento" | S — 15' |
| Deploy + email + commit | S — 10' |

## Test di accettazione

1. **Caso reale Marco ieri**: "interventi di Marco ieri" → "Marco ieri ha avuto 2 interventi e 1 spegnimento. CONDOMINIO STELLA A intervento (workHours 2.5h, 'Tolto valvola sicurezza'), CONDOMINIO STELLA A spegnimento, CONDOMINIO CAPPUCCINI ritorno aperto. (Una card duplicata della Stella A è stata raggruppata.)"
2. **Regression**: "interventi di Marco oggi" continua a trovare CONDOMINIO DEPRETIS co-assegnato a Lorenzo.
3. **Lettura ripartitori**: "letture di Marco questa settimana" → distingue le 30+ letture dai 2-3 interventi reali.
4. **Card senza originalBoardId**: dedup non rompe — fallback su boardName normalizzato.

## Nota operativa

Questo bug **non è una regressione** del fix precedente (label tecnici), ma una **questione di qualità del dato sottostante**: Trello sync produce occasionalmente card duplicate quando i tecnici riaprono/chiudono interventi. La nostra UX deve compensare con dedup intelligente.

In parallelo, conviene aprire una segnalazione al worker COSMINA per **prevenire** la creazione di duplicati in upstream — se card con stesso `originalBoardId` viene chiusa due volte a 2 minuti di distanza, mantenerne solo una. Questo è fuori scope del fix immediato ma è il fix radicale.
