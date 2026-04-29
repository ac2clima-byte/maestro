# Dev Analysis — 4T1mt8sJgwFht1tYXoKg

Data analisi: 2026-04-29
Source: `tasks/dev-request-4T1mt8sJgwFht1tYXoKg.md` (bug_from_chat,
sessione `nx_kotuenszmoj0bdkn`)

## 1. Diagnosi

### Conversazione

```
Alberto: Che interventi ha aperti domani Marco
NEXUS  : Marco domani ha in agenda un intervento il 30/04/2026:
         SPORTING SARA FEDERICA — VOGHERA … programmato non ancora eseguito.
         [ARES correttamente filtrato data=domani, count=1]

Alberto: Ha solo quell'intervento?
NEXUS  : Marco esegue 19 interventi e ha in agenda 1 intervento.
         14/02/2026, CONDOMINIO CARDUCCI, eseguito MARCO+DAVID
         25/02/2026, OFFICINA SAN BOVO, eseguito MARCO
         …(lista lunga di Q1 2026: febbraio-marzo, eseguiti+ritorni eseguiti)
         [BUG: ha cambiato scope, è uscito dal filtro "domani"]
```

### Cosa doveva succedere

Alberto sta chiedendo **conferma** che Marco abbia solo un intervento
PER DOMANI. La risposta corretta è una di queste tre, in ordine di
naturalezza:

1. **(preferita)** "Sì, è l'unico in bacheca per domani." — zero
   spesa LLM, riformulazione del risultato precedente.
2. Re-esegue ARES `interventi_aperti(tecnico=Marco, data=domani)`
   ottiene `count=1`, riformula: "Sì, è l'unico programmato per
   domani."
3. (Solo se Alberto chiarisce "in totale", "in generale") allora
   estende lo scope. NON spontaneamente.

### Cosa è successo realmente

Il routing intent del LLM Groq llama-3.3-70b ha:
1. **Ereditato il tecnico** (Marco) dal contesto multi-turno → giusto.
2. **Buttato il filtro temporale** (domani) → sbagliato.

Risultato: `parametri = {tecnico: "Marco"}`, **senza `data`**.

Il DIRECT_HANDLER `handleAresInterventiAperti` riceve queste
parametri, prova a estrarre `data` dal `userMessage` ("Ha solo
quell'intervento?") con `parseRangeDataInterventi`, che restituisce
`null` (nessuna parola di range). Quindi `range = null` → ARES NON
filtra per data → query Firestore restituisce **TUTTO lo storico
Marco** (19 interventi su 2 mesi: Q1 2026 febbraio-marzo).

### Confronto con bug `aJZD3WHPnM5JLAjHTZXl` (analisi precedente)

Stessa famiglia ma comportamento **opposto**:

| Bug | Pattern | Cosa fa LLM |
|-----|---------|-------------|
| `aJZD3WHPnM5JLAjHTZXl` | "Ha solo quello?" (T=18:14) | Routing a `nessuno/chiarimento` ("Potresti essere più specifico") — si arrende. |
| `4T1mt8sJgwFht1tYXoKg` | "Ha solo quell'intervento?" (T=18:38) | Routing a `ares/interventi_aperti` con tecnico ereditato MA filtro `domani` perso. Esegue query troppo ampia. |

Entrambi sono **sintomi della stessa causa root**: il prompt compatto
`buildOllamaSystemPrompt()` (`nexus.js:1491-1536`) non ha istruzioni
chiare su come gestire i follow-up di conferma. Il modello indovina
da solo, e indovina male in modi diversi.

### Bug secondario emerso — ARES include "eseguito" in stato non-terminale

Il filtro `STATI_TERMINALI_RE` in `ares.js:171`:
```js
const STATI_TERMINALI_RE = /\b(complet|chius|annul|terminat|cancel|risolt|finit)/;
```
**Non include** "eseguito" né "ritorno eseguito". Quindi quando
`includeTerminali=false` (default per query al presente non con
"tutti"), gli interventi con `stato:"eseguito"` **passano il filtro**
e vengono inclusi.

Questo spiega perché la lista contiene 18 righe "eseguito" / "ritorno
eseguito" tutte in passato (febbraio-marzo). L'utente che chiede
"interventi APERTI" si aspetta SOLO "programmato non ancora eseguito"
+ eventualmente "in corso", non lo storico chiuso.

Anche se il bug primario (filtro data perso) viene fixato, questo
bug secondario può tornare a mordere su query future tipo "che
interventi ha Marco?" senza data.

### Cause root identificate

**Causa A — Prompt compatto buca ereditarietà parametri temporali**

Il prompt compatto (`nexus.js:1491-1536`) menziona alla riga 1501:
```
parametri ares.interventi_aperti: {tecnico:"Marco", data:"oggi", citta:"alessandria"}
```
Ma NON dice esplicitamente: "se nel turno precedente il filtro era
`data=domani` e il messaggio attuale è una domanda di conferma sul
risultato, EREDITA `data=domani`". Il modello applica solo "eredita
il tecnico" come pattern intuitivo.

**Causa B — Risposte di conferma non hanno DIRECT_HANDLER dedicato**

Pattern come "ha solo quello?" / "ha solo quell'intervento?" / "tutto
qui?" / "nient'altro?" non hanno regex L1 in `DIRECT_HANDLERS`. Il
match `interventi_aperti` (riga 530-552) richiede o un nome tecnico
nel messaggio o una data esplicita o "interventi di X". Quindi il
turno cade sempre sul LLM.

**Causa C — `STATI_TERMINALI_RE` non copre "eseguito"** (bug ortogonale)

`ares.js:171` dimentica il pattern "eseguit" (la radice di
"eseguito/eseguita/eseguiti"). Va aggiunta.

## 2. File coinvolti

| File:riga | Cosa fa | Cosa modificare |
|-----------|---------|-----------------|
| `nexus.js:1491-1536 buildOllamaSystemPrompt` | Prompt compatto Groq+Ollama | Aggiungere regola "EREDITA parametri temporali oltre al tecnico" + esempio specifico "Ha solo quell'intervento?" |
| `nexus.js:530-552 DIRECT_HANDLER ARES` | Regex pre-LLM | Aggiungere DIRECT_HANDLER PRIMA di questo, per follow-up brevi tipo "ha solo quell'intervento?", che riformuli l'ultimo `assistant content` invece di rilanciare query |
| `ares.js:171 STATI_TERMINALI_RE` | Filtro stati terminali | Aggiungere `eseguit` alla regex |
| `nexus.js:1098-1127 loadConversationContext` | Carica ultimi 5 turni | OK, già funzionante |
| (analisi precedente `aJZD3WHPnM5JLAjHTZXl`) | Stessa famiglia bug | Le proposte P1+P2 di quell'analisi coprono parte di questo |

## 3. Proposta

Tre fix indipendenti (additivi). Ordine consigliato dal più
impattante al più chirurgico.

### P1 — `STATI_TERMINALI_RE` include "eseguito" (S, basso rischio)

In `ares.js:171`:
```js
// Prima:
const STATI_TERMINALI_RE = /\b(complet|chius|annul|terminat|cancel|risolt|finit)/;
// Dopo:
const STATI_TERMINALI_RE = /\b(complet|chius|annul|terminat|cancel|risolt|finit|eseguit)/;
```

Effetto:
- Query "interventi aperti di Marco" → esclude eseguiti/ritorni
  eseguiti automaticamente. Risultato pulito.
- Query "tutti gli interventi di Marco" / "interventi di Marco
  ieri" (tense=past) → `includeTerminali=true` quindi gli eseguiti
  vengono inclusi come prima.
- Nessuna regressione su altri handler.

### P2 — DIRECT_HANDLER follow-up conferme (M, medio rischio)

Stesso intervento già proposto nell'analisi `aJZD3WHPnM5JLAjHTZXl`
(P2 di quell'analisi). Aggiungere PRIMA del DIRECT_HANDLER ARES
(`nexus.js:530`) un handler:

```js
{
  match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase().trim();
    return /^(ha\s+solo\s+(quel|quell['oa]?\s+intervent[oi]?|quello|quella|quelli|quelle)|tutto\s+qui|tutto\s+li|nient(?:e)?\s+altro|c'?è\s+(?:dell?')?altro|è\s+tutto|sicuro|veramente|davvero)\s*\??\s*$/i.test(m);
  },
  fn: async (params, ctx) => {
    const sid = ctx?.sessionId;
    if (!sid) return { content: "Sì, era tutto." };
    const lastAsst = await getLastAssistantContent(sid);
    if (!lastAsst) return { content: "Sì, era tutto." };
    return reformulateAsConfirmation(lastAsst);
  },
},
```

Helper `reformulateAsConfirmation` (in nexus.js, vicino a
`getLastAssistantPendingEmails`):

```js
function reformulateAsConfirmation(lastAsstContent) {
  const t = String(lastAsstContent || "").toLowerCase();
  // "ha in agenda 1 intervento" / "ha N interventi" / etc.
  let m = t.match(/\b(?:ha|aveva)\s+in\s+agenda\s+(\d+|un|uno|una)\s+intervent/);
  if (m) {
    const n = m[1] === "un" || m[1] === "uno" || m[1] === "una" || m[1] === "1" ? 1 : Number(m[1]);
    if (n === 1) return { content: "Sì, è l'unico in bacheca per quel periodo." };
    return { content: `Sì, sono ${n} in totale.` };
  }
  // "ho N email" / "una email" / "un cliente"
  m = t.match(/\b(?:ho|c'è|ci sono|hai|ha)\s+(\d+|un|uno|una)\s+(email|mail|client|condomin|fattur|preventiv)/);
  if (m) {
    return { content: m[1] === "un" || m[1] === "uno" || m[1] === "una" || m[1] === "1"
      ? "Sì, è l'unico/a."
      : `Sì, sono ${m[1]} in totale.` };
  }
  // generico
  return { content: "Sì, era quello che ho trovato." };
}
```

Effetto:
- Latenza ~50ms invece di 2000ms+ del LLM.
- Match preciso per i pattern più frequenti ("ha solo quello?",
  "ha solo quell'intervento?", "tutto qui?", ecc.).
- Falsi positivi limitati dalla regex `^...?$` (frase intera, no
  parole extra).

### P3 — Aggiornamento prompt compatto con eredità parametri temporali (S, basso rischio)

In `nexus.js:1491-1536`, aggiungere PRIMA del blocco "REGOLE":

```
USO DEL CONTESTO CONVERSAZIONALE:
Negli ultimi turni della sessione (messages[]) c'è il contesto.
Usalo SEMPRE per disambiguare.

EREDITÀ PARAMETRI dal turno precedente:
- Domande di CONFERMA ("ha solo quel/quello/quell'intervento?",
  "tutto qui?", "è tutto?", "nient'altro?"): NON cambiare lo scope.
  Se il turno precedente era ares/interventi_aperti(tecnico=Marco,
  data=domani), MANTIENI ESATTAMENTE quei parametri. Non rilanciare
  con scope più ampio.
- Domande di ESTENSIONE ("e nei prossimi giorni?", "e dopodomani?",
  "e gli altri tecnici?"): EREDITA tecnico+città dal turno precedente
  ma CAMBIA il parametro indicato.
- Pronomi ("lui", "loro", "li", "quel cliente"): SEMPRE riferiti
  all'ultimo argomento.

VIETATO rispondere "non capisco" o "potresti essere più specifico"
se nei messages[] precedenti c'è un argomento correlato.
Riprova il routing del turno precedente con i parametri ereditati.
```

E modificare la riga 1531:
```
// Prima:
Se il messaggio non è chiaro, usa collega="nessuno" azione="chiarimento".
// Dopo:
Se il messaggio non è chiaro E messages[] è vuoto o non correlato,
usa collega="nessuno" azione="chiarimento".
Altrimenti EREDITA dal turno precedente (tecnico, data, città).
```

## 4. Rischi e alternative

### Rischi

- **R1 (P1)** — `eseguit` matcha anche frasi tipo "lavoro non eseguito"
  in caso di ambiguità ortografica. Il filtro è su `data.stato`
  (campo Firestore controllato), non su free text → rischio nullo.
  Verificare che valori esistenti siano: "eseguito", "ritorno
  eseguito", "in esecuzione" (quest'ultimo NON va escluso!). La
  regex `\beseguit/` matcha "in esecuzione" (esegui+t). PROBLEMA.

  Mitigazione: usare regex più specifica:
  ```js
  /\b(complet|chius|annul|terminat|cancel|risolt|finit|eseguito|eseguita|eseguiti|eseguite)\b/
  ```
  Esclusione esplicita di "esecuzione" / "in corso".

- **R2 (P2)** — Falsi positivi sul DIRECT_HANDLER. La frase "ha solo
  quell'intervento?" può essere ambigua in contesti non-ARES.
  Mitigazione: la riformulazione `reformulateAsConfirmation` legge
  l'ultimo assistant content e si adatta. Se il contesto non era su
  interventi, riformula da quello (es. email).

- **R3 (P3)** — Prompt più lungo aumenta token consumati per ogni
  request Groq (+50-100 token). Quota gratuita 14400 req/giorno =
  margine ampio, impatto trascurabile.

- **R4 (P3)** — Rischio che il LLM diventi "rigido" e mantenga il
  filtro `domani` anche quando Alberto vuole davvero estendere
  ("e in totale?" → dovrebbe estendere). Mitigazione: la regola dice
  "domanda di CONFERMA mantiene scope, domanda di ESTENSIONE cambia"
  con esempi.

### Alternative

- **A1 — Solo P1** (fix STATI_TERMINALI): risolve solo il bug
  secondario. Il bug primario (eredita scope sbagliato) resta.
- **A2 — Solo P2** (DIRECT_HANDLER): cattura le frasi fisse "ha solo
  quell'intervento?" e simili. Per varianti non previste cade ancora
  su LLM. Half-fix.
- **A3 — Solo P3** (prompt fix): risolve il routing ma dipende dalla
  qualità di llama-3.3-70b. Senza P2, ogni follow-up costa 2s di LLM
  invece di 50ms regex.
- **A4 — Tutte e tre** (raccomandato): coverage completa.

**Raccomandazione**: P1 + P2 + P3 insieme. P1 è quasi gratuito
(1 riga + test su valori `stato` reali), P2 cattura il caso
specifico con zero costo LLM, P3 educa il modello per varianti
future.

## 5. Effort

| Step | Effort | Test richiesto |
|------|--------|----------------|
| P1 — `STATI_TERMINALI_RE` include eseguito | **S** (10 min + test) | Verificare valori reali di `bacheca_cards.stato` su Firestore prima del deploy. Test FORGE: query "interventi aperti Marco" e "tutti interventi Marco". |
| P2 — DIRECT_HANDLER follow-up + helper riformulazione | **M** (1.5h) | Test FORGE su 8 varianti reali (+ 3 negativi che NON devono triggerare). |
| P3 — Aggiornamento prompt compatto | **S** (15 min) | Test FORGE su sequenza 2-turn: query base + follow-up. Almeno 5 sequenze diverse. |

**Totale: M** (3-4h sviluppo + test FORGE + deploy).

### Test FORGE consigliati post-fix

```
Sessione baseline (testa P1 + P3):
1. "che interventi aperti ha Marco?" (no data)
   → DEVE escludere "eseguito" (P1). Solo programmati.

2. "che interventi ha eseguito Marco febbraio?" (passato esplicito)
   → DEVE includere "eseguito" (tense=past, includeTerminali=true).

Sessione conferma (testa P2 + P3):
3. "che interventi ha aperti domani Marco?" → ARES, count=N
4a. "ha solo quell'intervento?" → DIRECT_HANDLER P2 → conferma "Sì, è l'unico"
4b. "tutto qui?" → idem
4c. "nient'altro?" → idem
4d. "è tutto?" → idem

Sessione estensione (testa P3):
5. "che interventi ha aperti domani Marco?" → ARES, count=1
6. "e nei prossimi giorni?" → MANTIENI tecnico=Marco, CAMBIA data="prossimi giorni"
7. "e federico?" → MANTIENI data="prossimi giorni", CAMBIA tecnico=Federico

Negativi (NON devono triggerare il DIRECT_HANDLER P2):
8. "ha solo quell'intervento Marco?" (frase più lunga) → routing normale ARES
9. "ha solo lavoro stamattina?" (no "intervento") → routing normale
```

## 6. Note operative

- Nessuna modifica a Firestore schema, rules, IAM, secrets.
- Deploy = `firebase deploy --only functions:nexusRouter,functions:nexusTestInternal`
  (region `europe-west1`).
- Cache busting PWA non necessario (modifiche solo backend).
- Compatibile con migrazione Anthropic→Groq appena completata.
- **Coordina con `aJZD3WHPnM5JLAjHTZXl`**: P2 e P3 di questa analisi
  sostituiscono e completano P1+P2 di quell'analisi (sono la stessa
  famiglia di fix). Implementare INSIEME, in un solo PR.
- P1 (STATI_TERMINALI) è ortogonale e può andare in PR separato se
  preferisci (low risk, rollback semplice).

Niente da implementare ora, come da istruzioni del task.
