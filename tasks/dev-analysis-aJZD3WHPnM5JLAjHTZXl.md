# Dev Analysis — aJZD3WHPnM5JLAjHTZXl

Data analisi: 2026-04-29
Source: `tasks/dev-request-aJZD3WHPnM5JLAjHTZXl.md` (bug_from_chat,
sessione `nx_r0ogfvwtmokb1u32`)

## 1. Diagnosi

### Conversazione

```
Alberto: ciao
NEXUS  : Ciao Alberto, dimmi pure.                                   [regex L1, OK]
Alberto: che interventi ha domani marco?
NEXUS  : Marco domani ha in agenda un intervento il 30/04/2026:
         SPORTING SARA FEDERICA - STRADA BOBBIO 28 - VOGHERA (PV)
         (SMONTARE RIPARTITORE PER SOSTITUZIONE RADIATORE),
         programmato non ancora eseguito.                            [ARES OK]
Alberto: ha solo quello?
NEXUS  : Potresti essere più specifico? Non capisco cosa intendi.    [BUG]
```

### Cosa doveva succedere

Alberto sta chiedendo **conferma** che il risultato precedente è
completo: "ha solo quel UN intervento Marco domani?". Sono possibili
tre interpretazioni corrette:

1. **(preferita)** NEXUS ricorda di aver appena risposto "1 intervento"
   e re-conferma in modo conversazionale: "Sì, è l'unico programmato
   per domani in bacheca." Costo zero (no LLM, no Firestore).
2. NEXUS ri-esegue la stessa query ARES `interventi_aperti(tecnico=Marco,
   data=domani)` e confronta count → "Sì, è l'unico." Costo: 1 query Firestore.
3. NEXUS estende il range a "anche gli altri giorni" → `interventi_aperti(tecnico=Marco,
   data=prossimi giorni)` e dice "Domani solo quello, ma settimana prossima ne ha N".
   Cambio scope (rischio: confonde Alberto), evitabile.

L'opzione (1) è la più naturale, allineata al modo in cui ne
parlerebbe un collega umano.

### Cosa è successo realmente

Il routing intent è andato su `nessuno/chiarimento` e il LLM ha
generato `rispostaUtente: "Potresti essere più specifico? Non capisco
cosa intendi"`. La frase NON è hardcoded — è una risposta inventata
dal modello per coprire l'azione `chiarimento`.

Verifica empirica: post-deploy della migrazione Anthropic→Groq, un
test FORGE smoke con messaggio "come sta il sistema?" ha prodotto
**la stessa frase quasi identica**:

```
"Il sistema sembra funzionare correttamente, ma potresti essere più
specifico?" → intentSource:groq, model:llama-3.3-70b-versatile
```

Quindi il pattern "Potresti essere più specifico?" è una formula
ricorrente del modello Groq quando va su `nessuno/chiarimento`.

### Causa root (3 livelli)

**Livello 1 — Prompt compatto manca regole anti-arrendimento**

Il routing usa `buildOllamaSystemPrompt()` (`nexus.js:1491-1536`), un
prompt **compatto** introdotto il 28/04 quando Groq+Ollama sostituirono
Haiku. È usato sia per Groq che Ollama (`nexus.js:1432, 1471`).

Questo prompt **NON contiene** le sezioni critiche presenti nel prompt
lungo `NEXUS_SYSTEM_PROMPT` (riga 53-258):
- Sezione "USO DEL CONTESTO CONVERSAZIONALE" (riga 216-227): la regola
  che spiega come gestire pronomi e riferimenti dal contesto.
- Sezione "REGOLA SUL NON-ARRENDERSI" (riga 229-237): vieta esplicitamente
  di rispondere "non ho capito" quando il contesto è disponibile.
- Riga 245: `VIETATO rispondere "non ho capito, puoi riformulare?"`.

Inoltre il prompt compatto ha la regola **opposta** alla riga 1531:
```
Se il messaggio non è chiaro, usa collega="nessuno" azione="chiarimento".
```
Questo dà al LLM una via d'uscita facile per dire "non capisco" anche
quando il contesto contiene ovvi indizi.

**Livello 2 — Frase di chiarimento è sintetizzata, non controllata**

Quando l'azione è `nessuno/chiarimento`, il `rispostaUtente` viene
preso direttamente dal JSON del LLM senza filtri (`nexus.js:280-313
parseAndValidateIntent`). Non c'è una whitelist di frasi accettabili
né un override per il pattern "Potresti essere più specifico".

**Livello 3 — Manca un DIRECT_HANDLER per follow-up brevi**

Pattern come "ha solo quello?", "tutto qui?", "nient'altro?", "quanti
sono?" (dopo una risposta che ha già contato), "c'è altro?" sono
**conferme/richieste-di-totale** sul risultato precedente. Nessun
DIRECT_HANDLER li intercetta in `nexus.js:333-660` (`DIRECT_HANDLERS`).

## 2. File coinvolti

| File:riga | Cosa fa | Cosa modificare |
|-----------|---------|-----------------|
| `nexus.js:1491-1536 buildOllamaSystemPrompt()` | Prompt compatto Groq+Ollama | Aggiungere regola "USO CONTESTO" + "VIETATO chiarimento se contesto chiaro" |
| `nexus.js:1531` | "Se il messaggio non è chiaro, usa chiarimento" | Restringere: SOLO se `messages[]` è vuoto o non correlato |
| `nexus.js:333-660 DIRECT_HANDLERS` | Regex pre-LLM | Aggiungere handler "follow-up conferma" che intercetta "ha solo quello?", "tutto qui?", "nient'altro?", "è tutto?" e usa l'ultimo `assistant` content per rispondere |
| `nexus.js:280-313 parseAndValidateIntent` | Sanitizza output LLM | (opzionale) intercept frasi tipo "Potresti essere più specifico" e re-route con history |
| `nexus.js:1098-1127 loadConversationContext` | Carica ultimi 5 turni | OK così, già funziona |

### File NON modificare

- `handlers/ares.js`: l'handler ha risposto giustamente alla query
  precedente. Non c'entra.
- `index.js` / `forge.js`: il problema è solo nel system prompt.

## 3. Proposta

Tre interventi ortogonali (additivi, ognuno fa parte la sua):

### P1 — Aggiornare `buildOllamaSystemPrompt` con sezione contesto (S, basso rischio)

In `nexus.js:1491-1536`, aggiungere queste sezioni PRIMA del blocco
"REGOLE":

```
USO DEL CONTESTO CONVERSAZIONALE:
Negli ultimi turni della sessione (messages[]) c'è il contesto di
quello che state facendo. Usalo SEMPRE per disambiguare.
- Pronomi e riferimenti ("lui", "loro", "li", "quello", "quel", "ne"):
  ereditano il soggetto del turno precedente.
- Domande di conferma/totale ("ha solo quello?", "è tutto?", "nient'altro?",
  "quanti sono in totale?") riguardano il RISULTATO appena dato.
- Domande di estensione ("e nei prossimi giorni?", "e domani?", "e gli
  altri tecnici?") ereditano TUTTI i parametri del turno precedente
  (tecnico, città, range modificato).

VIETATO rispondere "non capisco" / "potresti essere più specifico" /
"non ho capito" se nei messages[] precedenti c'è un argomento a cui
il messaggio si riferisce. Riprova il routing del turno precedente
oppure rispondi conversazionalmente con il dato già visibile.
```

E modificare la riga 1531 da:
```
Se il messaggio non è chiaro, usa collega="nessuno" azione="chiarimento".
```
a:
```
Se il messaggio non è chiaro E messages[] è vuoto o non c'è contesto
correlato, usa collega="nessuno" azione="chiarimento".
Altrimenti EREDITA dal turno precedente.
```

### P2 — DIRECT_HANDLER follow-up conferme (M, medio rischio)

Aggiungere in `nexus.js:333-660 DIRECT_HANDLERS` (preferibilmente
prima dei catch-all generici), un handler che intercetta le domande
di conferma sul risultato precedente:

```js
{
  match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase().trim();
    return /^(ha\s+solo\s+(quello|quella|quelli|quelle)|tutto\s+qui|tutto\s+li|nient(?:e)?\s+altro|c'?è\s+(?:dell?')?altro|è\s+tutto|sicuro|veramente|davvero)\s*\??\s*$/i.test(m);
  },
  fn: async (params, ctx) => {
    // Cerca l'ultimo assistant message della sessione
    const sid = ctx?.sessionId;
    if (!sid) return { content: "Sì, era tutto." };
    const lastAsst = await getLastAssistantContent(sid);
    if (!lastAsst) return { content: "Sì, era tutto." };
    // Re-conferma in modo conversazionale, citando il dato
    return reformulateAsConfirmation(lastAsst); // helper che ripete in 1 frase
    // Es: input lastAsst = "Marco domani ha 1 intervento: SPORTING SARA..."
    // output: "Sì, è l'unico in bacheca per domani."
  },
}
```

Il helper `getLastAssistantContent(sid)` esiste già nel pattern del
modulo (vedi `getLastAssistantPendingEmails` riga 799). Va aggiunto
un `reformulateAsConfirmation` che fa una riformulazione semplice:
- se l'ultimo content cita "1 intervento" / "una mail" / "un cliente"
  → "Sì, è l'unico/a"
- se cita "N interventi" → "Sì, sono N in totale"
- altrimenti → "Sì, è quello che ho trovato"

### P3 — Sanitizer in `parseAndValidateIntent` (S, basso rischio)

In `nexus.js:280-313`, dopo aver parsato l'intent, se `collega ==
"nessuno"` E `azione == "chiarimento"` E la `rispostaUtente` matcha
il pattern "non capisco / più specifico / non chiaro", invece di
restituire chiarimento ritornare un fallback che invita a riprovare
con la query precedente:

```js
if (collega === "nessuno" && azione === "chiarimento") {
  const t = String(rispostaUtente).toLowerCase();
  if (/(non\s+capisco|più\s+specifico|riformul|non\s+ho\s+capit|non\s+è\s+chiar)/i.test(t)) {
    // Override: forza il caller a re-leggere il contesto
    return {
      ...intent,
      _needsContextRetry: true,
      rispostaUtente: "Dammi un secondo, ci penso meglio.", // placeholder
    };
  }
}
```

Il caller (`index.js` riga ~615 e `forge.js` riga ~382) può
controllare il flag e fare un secondo passaggio LLM con prompt esteso
che include esplicitamente "REGOLA: usa il contesto, NON chiedere
chiarimenti".

### Ordine consigliato

1. **P1 prima** (cintura): risolve il 90% dei casi senza nuovo codice.
2. **P2 dopo** (handler dedicato): cattura i pattern fissi senza
   spesa LLM. Latenza ~50ms invece di 2000ms+.
3. **P3 ultimo** (sanitizer): defense-in-depth se LLM sfugge ancora.

## 4. Rischi e alternative

### Rischi

- **R1 — P2 cattura falsi positivi**: la regex "ha solo quello?" può
  matchare in contesti diversi. Mitigazione: il match richiede `^...?$`
  cioè frase intera senza altre parole — restrittivo. Test su 10
  varianti reali consigliato (ARES, IRIS, PHARO contesti diversi).
- **R2 — P1 può rendere Groq troppo "cocciuto"**: se eredita il
  contesto anche quando Alberto cambia argomento davvero. Mitigazione:
  la regola dice "se messages[] non correlato" → il LLM deve fare
  una distinzione semantica, che llama-3.3-70b è in grado di fare.
- **R3 — P2 helper `reformulateAsConfirmation`**: serve qualità
  italiana naturale. Per la prima versione bastano 4-5 pattern
  hardcoded; la frase generica "Sì, è quello che ho trovato" copre
  i casi non riconosciuti.
- **R4 — Latenza Groq dopo P3 retry**: il sanitizer aggiunge un
  secondo passaggio LLM (4s totali invece di 2s). Mitigazione:
  P1 + P2 dovrebbero ridurre i casi che arrivano a P3 < 5%.

### Alternative

- **A1 — Solo P1 (prompt fix)**: minimo intervento, dipende
  totalmente dalla qualità di llama-3.3-70b. Rischio: scarsamente
  testabile.
- **A2 — Re-introduco prompt lungo `NEXUS_SYSTEM_PROMPT`** anche per
  Groq (non solo Ollama). Pro: più completo. Contro: triplica i
  token consumati per ogni request → quota Groq esaurita prima.
- **A3 — Memoria semantica (embeddings)**: costoso, fuori scope.
- **A4 — Solo P2 (handler dedicato)**: cattura "ha solo quello?" e
  poche altre frasi fisse. Per varianti non previste cade ancora su
  LLM con stesso bug. Half-fix.

**Raccomandazione**: P1 + P2 insieme. P3 opzionale, da valutare dopo
una settimana di osservazione post-fix.

## 5. Effort

| Step | Effort | Test richiesto |
|------|--------|----------------|
| P1 — aggiornamento prompt compatto | **S** (15 min) | Test FORGE su 5 varianti follow-up |
| P2 — DIRECT_HANDLER + helper | **M** (1h) | Test unit + FORGE su 10 frasi reali |
| P3 — sanitizer + retry path | **M** (1h) | Test che misuri tasso di fall-through |

**Totale: M** (mezza giornata sviluppo + test).

### Test FORGE consigliati

```
Sessione baseline:
1. "che interventi ha domani marco?"   → ARES, restituisce N interventi
2a. "ha solo quello?"                  → DEVE riconfermare, non chiedere
2b. "tutto qui?"                       → idem
2c. "nient'altro?"                     → idem
2d. "è tutto?"                         → idem
2e. "sicuro?"                          → idem
3. "e nei prossimi giorni?"            → range esteso (vedi task oHNM7rT3oXHHFpkY28CI)
4. "e federico?"                       → cambio tecnico, mantieni range
5. "fammi un riepilogo"                → ricorda contesto

Negativi (non devono triggerare il nuovo handler P2):
6. "ha solo quello da fare?"           → non match (non è ^...?$)
7. "tutto qui c'è solo questo"         → non match (frase più lunga)
```

## 6. Note operative

- Nessuna modifica a Firestore schema, rules, IAM, secrets.
- Deploy = `firebase deploy --only functions:nexusRouter,functions:nexusTestInternal`
  (region `europe-west1`).
- Cache busting PWA non necessario (modifiche solo backend).
- Compatibile con migrazione Groq appena fatta (non rompe nulla).

Niente da implementare ora, come da istruzioni del task.
