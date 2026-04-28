# Analisi dev-request `e9KNWku90w4akhyBr0Ec`

**Data:** 2026-04-28
**Tipo:** bug_from_chat (3 bug correlati visibili nella conversazione)
**Sessione:** `nx_sbq7j0mxmog9wafi`

## Sintesi: 3 bug distinti in una sola sessione

Nella conversazione si vedono tre problemi diversi:

1. **Bug A — Dettatura vocale che accumula trascrizioni interim crescenti**
   ("victologia victologia un victologia un intervento il 27 aprile..."). È
   l'effetto più visibile e probabilmente la causa scatenante della sessione.
2. **Bug A2 — `tryAnalyzeLongText` mangia il rumore** prodotto dal Bug A e
   produce risposte tipo "Ho letto il messaggio di sconosciuto." Sintomo
   conseguente del Bug A, ma con causa propria (heuristica di intercept).
3. **Bug B — "Che interventi ci sono oggi" finisce su `crea_intervento`**
   invece di `interventi_aperti`. Bug indipendente di routing: la query
   senza tecnico non matcha nessun regex L1 e cade su Ollama 1.5b che
   allucina `azione=crea_intervento`.

(Esiste anche un Bug C più sfumato — "Victor 27/04 → CONDOMINIO LESIMA" è
una risposta fluttuante, in un altro turno NEXUS dice "non ha interventi
pianificati per lunedì 27" — ma è una manifestazione del L2 LLM
inconsistente, non un bug strutturale; non lo includo nelle proposte.)

---

## Bug A — Dettatura vocale: trascrizioni interim/final accumulate

### Diagnosi

Il pattern "victologia victologia un victologia un intervento il 27 aprile..."
è la fingerprint classica del Web Speech API che emette **ripetuti `isFinal=true`
con trascrizioni cumulative crescenti** invece di una sola trascrizione finale.

Su Chrome desktop il comportamento è "1 finalChunk per pausa". Su iOS
Safari e Chrome Android — dove Alberto usa la PWA — capita spesso che il
motore emetta:
- evento 1: `r[0].transcript = "victologia"`, `isFinal=true`
- evento 2: `r[0].transcript = "victologia un"`, `isFinal=true`
- evento 3: `r[0].transcript = "victologia un intervento"`, `isFinal=true`
- … e così via

Il codice attuale (`projects/nexo-pwa/public/js/app.js:2518-2533`) tratta
ogni `isFinal=true` come incremento da appendere:

```js
// app.js:2522-2525
for (let i = ev.resultIndex; i < ev.results.length; i++) {
  const r = ev.results[i];
  if (r.isFinal) finalChunk += r[0].transcript;
  else interim += r[0].transcript;
}
if (finalChunk) nexusVoice.finalText = (nexusVoice.finalText + " " + finalChunk).trim() + " ";
```

Risultato: `finalText` diventa la concatenazione di tutte le versioni:
"victologia + victologia un + victologia un intervento + …".

### File coinvolti

- `projects/nexo-pwa/public/js/app.js`
  - 2395-2406 — stato `nexusVoice`
  - **2518-2533 — `rec.onresult` handler (dove va la fix)**
  - 2432-2451 — `nexusScheduleAutoSend` (auto-invio dopo 1.5s silenzio:
    su mobile la pausa è breve, l'invio scatta col testo accumulato).
  - 2554-2560 — `rec.onend` ri-avvia continuamente la SR; ogni restart
    aumenta la probabilità di duplicazioni.

### Proposta

**Dedup euristica nel `onresult`**: se il nuovo `finalChunk` è prefisso
del precedente o lo contiene per intero, **sostituire** invece di
**concatenare**.

Logica proposta (pseudocodice):

```js
function _mergeFinalChunk(existingFinal, newChunk) {
  const a = (existingFinal || "").trim();
  const b = (newChunk || "").trim();
  if (!b) return a;
  if (!a) return b;
  // Caso 1: il nuovo chunk È un prefisso esteso dell'ultimo finale
  // → sostituisci l'ultimo segmento, mantieni tutto il resto.
  // Splitta a su l'ultimo punto/virgola/lunga pausa: <prefix>. <last>
  // Se b inizia con last, sostituisci last con b.
  const lastSep = a.search(/(?<=[.?!])\s+\S/);
  const prefix = lastSep > 0 ? a.slice(0, lastSep + 1).trim() : "";
  const lastSeg = lastSep > 0 ? a.slice(lastSep + 1).trim() : a;
  if (b.toLowerCase().startsWith(lastSeg.toLowerCase())) {
    return (prefix ? prefix + " " : "") + b;
  }
  // Caso 2: il nuovo chunk contiene l'ultimo segmento al suo interno
  if (b.toLowerCase().includes(lastSeg.toLowerCase()) && lastSeg.length > 5) {
    return (prefix ? prefix + " " : "") + b;
  }
  // Caso 3: nuovo chunk indipendente → append normale
  return a + " " + b;
}
```

Modifica da fare (app.js:2525):

```diff
- if (finalChunk) nexusVoice.finalText = (nexusVoice.finalText + " " + finalChunk).trim() + " ";
+ if (finalChunk) nexusVoice.finalText = _mergeFinalChunk(nexusVoice.finalText, finalChunk) + " ";
```

**In aggiunta** — guardia anti-DOS lato handler: se il messaggio supera
una soglia ragionevole (es. 800 char) **e** non è chiaramente una mail
incollata (presenza di `>`, `wrote:`, indirizzi email), tronca a 800 char
con un avviso ad Alberto invece di mandarlo a Ollama. Costo ~2 righe in
`index.js:534`.

### Rischi

- La dedup euristica può "perdere" una ripetizione legittima ("ti ho detto
  ti ho detto" come frase voluta). Mitigazione: applicare dedup solo se
  `newChunk` è ≥10 char e include `lastSeg` come **prefisso**, non
  ovunque. Le ripetizioni legittime brevi non scattano.
- Su browser dove SR funziona bene (Chrome desktop) la dedup è no-op
  perché `lastSeg` non è prefisso di un `finalChunk` indipendente.

### Effort: **S** (15-30 min)

Modifica localizzata in app.js `rec.onresult`. Test E2E su PWA mobile
necessario (richiede device fisico — Chrome desktop non riproduce il bug).

---

## Bug A2 — `tryAnalyzeLongText` analizza rumore vocale

### Diagnosi

Quando il Bug A produce un messaggio di 700+ char di sequenze ripetute,
il primo intercept dopo `tryInterceptDevRequest` è `tryAnalyzeLongText`
(`index.js:534`). La heuristica `shouldAnalyzeTextDirectly` (nexus.js:1245-1262):

```js
// Heuristica: testo lungo (>200 char) senza domanda esplicita
if (t.length > 200) {
  const isQuestion = /\?|^(quante?|quanti|cosa|come|dove|quando|chi|perché|apri|manda|scrivi|dimmi|cerca|trova|registra|fammi)\s/i.test(t);
  if (!isQuestion) return true;  // ← scatta qui per il rumore vocale
}
```

Il rumore voce è >200 char, non inizia con un verbo-domanda riconosciuto,
quindi viene mandato a `callHaikuForTextAnalysis`. Haiku (o Ollama via
fallback) cerca di estrarre `mittente/riepilogo/prossimo_passo`. Il
risultato è la risposta robotica "Ho letto il messaggio di sconosciuto."
o "di non" (perché "non ha interventi pianificati" inizia con "non" e
Haiku assume sia il mittente).

### File coinvolti

- `projects/iris/functions/handlers/nexus.js:1245-1262` — `shouldAnalyzeTextDirectly`
- `projects/iris/functions/handlers/nexus.js:1297-1327` — `formatTextAnalysis`
  (genera "Ho letto il messaggio di [mittente]")
- `projects/iris/functions/index.js:534` — call site

### Proposta

Aggiungere a `shouldAnalyzeTextDirectly` un check di **bassa entropia
testuale**: se il rapporto parole-uniche / parole-totali è < 0.3 e
non c'è un marker di mail incollata (`wrote`, `>`, "Da:", "From:"),
ritorna `false` (non analizzare). È un'euristica robusta per filtrare
rumore vocale ripetitivo.

```js
function _looksRepetitive(t) {
  const words = t.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  if (words.length < 20) return false;
  const unique = new Set(words);
  return (unique.size / words.length) < 0.3;
}

function shouldAnalyzeTextDirectly(userMessage) {
  const t = String(userMessage || "").trim();
  if (!t) return false;
  if (/^(analizz[aa]|leggi|riassumi)\s+/i.test(t)) return true;
  if (t.length > 200) {
    const hasMailMarkers = /(ha\s+scritto|wrote|^Da:|^From:|>\s|:\s*\n)/im.test(t);
    if (_looksRepetitive(t) && !hasMailMarkers) return false;  // ← nuovo
    const isQuestion = /\?|^(quante?|...)\s/i.test(t);
    if (!isQuestion) return true;
    if (/^(.{0,50}(ha\s+scritto|wrote|:.*\n|>\s))/im.test(t)) return true;
  }
  return false;
}
```

### Rischi

- Falsi negativi se Alberto incolla davvero un testo molto ripetitivo
  (poco probabile in contesto ACG).
- Soglia 0.3 → da tarare. In caso di troppi falsi negativi, stringere a 0.2.

### Effort: **S** (10 min)

Funzione pura, facile da testare con unit test.

---

## Bug B — "Che interventi ci sono oggi" → `crea_intervento`

### Diagnosi

La query "Che interventi ci sono oggi" non matcha nessuno dei regex L1
in `DIRECT_HANDLERS`:

- `nexus.js:515` — `\bintervent[io]\s+(?:apert[io]\s+)?(?:di|del|per)\s+[a-z]/i`:
  richiede "interventi di/del/per [nome]" → NO ("ci sono")
- `nexus.js:516` — `\bintervent[io]\s+(?:di\s+)?oggi\b/i`: richiede
  "interventi" subito seguito da "oggi" o "di oggi" → NO
  (in mezzo c'è "ci sono")
- `nexus.js:519` — pattern con whitelist tecnici: nessun tecnico → NO
- `nexus.js:522` — pattern città: nessuna città → NO

Quindi il messaggio cade in L2 (Haiku → Ollama 1.5b fallback, perché il
balance Anthropic è ancora a -0.03 USD). Ollama qwen2.5:1.5b sul prompt
generico routing produce un'allucinazione e ritorna
`{"collega":"ares","azione":"crea_intervento"}`. Il `tryDirectAnswer`
post-LLM trova `handleAresCreaIntervento` che — non trovando tecnico/data/
condominio nel `userMessage` — risponde con il messaggio di "missing
fields".

Esattamente quello che ha visto Alberto:
> "Per aprire un intervento mi serve ancora: condominio o indirizzo.
> Esempio: 'metti intervento a Federico domani mattina al condominio
> Kristal per controllo caldaia'."

### File coinvolti

- `projects/iris/functions/handlers/nexus.js:509-524` — DIRECT_HANDLERS
  per `handleAresInterventiAperti` (il regex da estendere)
- `projects/iris/functions/handlers/nexus.js:1433-1473` — `buildOllamaSystemPrompt`
  (per migliorare il fallback Ollama)
- `projects/iris/functions/handlers/ares.js:226+` — `handleAresInterventiAperti`
  (verifica che gestisca il caso "data senza tecnico" → mostra TUTTI gli
  interventi del giorno).

### Proposta

**Step 1 — Estendere i regex L1 di `handleAresInterventiAperti`** per coprire
le query generiche "che/quali/quanti interventi …":

```js
// nexus.js:524 (aggiungere PRIMA del return false)
// Pattern generici: "che/quali/quanti interventi … oggi/domani/[data]"
if (/\b(che|quali|quanti|cosa|come)\b.*\bintervent[io]\b/i.test(m)
    && /\b(oggi|domani|dopodomani|ieri|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|\d{1,2}\/\d{1,2}|stamattina|stasera|stamane)\b/i.test(m)) {
  return true;
}
// "interventi oggi/domani" anche con parole intermedie ("interventi che ci sono oggi")
if (/\bintervent[io]\b.*\b(oggi|domani|dopodomani|stamattina|stasera)\b/i.test(m)) {
  return true;
}
// "interventi di oggi/domani"
if (/\bintervent[io]\s+di\s+(oggi|domani|dopodomani)\b/i.test(m)) {
  return true;
}
```

**Step 2 — Verificare che `handleAresInterventiAperti` gestisca il caso
senza tecnico**: se `parametri.tecnico` è vuoto, deve mostrare TUTTI gli
interventi del giorno (raggruppati per tecnico). Se questo non c'è già,
va aggiunto. Da verificare in `ares.js:226` durante l'implementazione.

**Step 3 — Esempi few-shot Ollama**: estendere `buildOllamaSystemPrompt`
con esempi specifici tipo:

```
- "che interventi ci sono oggi" → ares/interventi_aperti, parametri:{data:"oggi"}
- "interventi della giornata" → ares/interventi_aperti, parametri:{data:"oggi"}
- "quali interventi domani" → ares/interventi_aperti, parametri:{data:"domani"}
```

Lo step 3 è un beneficio extra: anche con regex L1 estesi, qualunque
formulazione fuzzy che cade su Ollama dà routing corretto.

### Rischi

- I regex più larghi possono catturare frasi non query, es. "domani metto
  un intervento". MITIGAZIONE: il guard `if (isCreaInterventoCommand(m)) return false;`
  alla riga 512 protegge dalla creazione (verbo "metti/crea/programma…"
  ha priorità). Il caso "interventi che metto domani" non è un comando
  creazione (manca "metti intervento" come verbo+oggetto) e non è una
  query realistica → non rischiato.
- Step 2 (handler senza tecnico) potrebbe richiedere refactor della
  query Firestore — potrebbe scalare male se tutti i tecnici hanno
  500+ card. MITIGAZIONE: limit 200 per tecnico + dedup, già pattern
  in uso nel handler.

### Alternative

- **A** (proposta): regex L1 estesi.
- **B**: lasciare cadere su Ollama e migliorare solo il prompt few-shot.
  Più semplice ma più lento e dipende da LLM disponibile.
- **C**: tornare a Haiku quando balance OK e affidarsi a quello. Non
  risolve il problema strutturale (Haiku può fallire in futuro).

Raccomando **A + step 3 (few-shot)**: regex copre il 90% senza LLM,
few-shot copre i casi residui.

### Effort: **M** (45-60 min)

- 15 min: regex estesi e test in console (`node` regex tester)
- 20 min: verificare/aggiornare `handleAresInterventiAperti` per il caso
  "tutti tecnici, data oggi"
- 10 min: deploy + test FORGE
- 10-15 min: writeup few-shot Ollama (opzionale)

---

## Riepilogo proposta

| Bug | Severità | Effort | Priorità |
|---|---|---|---|
| **A** dettatura ripetitiva | Alta (rompe esperienza voce mobile) | S | 1 |
| **A2** tryAnalyzeLongText su rumore | Media (peggiora UX, conseguenza di A) | S | 2 |
| **B** "che interventi oggi" → crea | Media (routing sbagliato, query frequente) | M | 3 |

**Ordine consigliato**: A → A2 → B. A risolve la causa, A2 mette una rete
di sicurezza in caso di altri rumori voce non previsti, B è indipendente
e migliora il routing in generale.

**Test plan**:

1. **Bug A**: deploy hosting PWA, dettare su mobile (Chrome iOS/Android)
   "Federico ha un intervento domani" e verificare che `nexusInput.value`
   sia esattamente la frase, non una concatenazione cumulativa.
2. **Bug A2**: unit test su `_looksRepetitive` con stringhe ripetitive,
   stringhe email reali, stringhe domande lunghe.
3. **Bug B**: FORGE test
   `curl /nexusTestInternal -d '{"sessionId":"forge-test-bugB","message":"che interventi ci sono oggi"}'`
   → atteso `intentSource: "regex", collega: "ares"`. Stesso per "quali
   interventi domani", "interventi della giornata".

## Stato Anthropic

Il bug B oggi è **amplificato** dal balance esaurito (Haiku 400 → Ollama
1.5b → allucinazione). Quando Alberto ricarica i crediti Anthropic, Haiku
sui pattern ambigui darà routing migliore di Ollama 1.5b — ma la fix
regex L1 resta corretta a prescindere (zero LLM > LLM, indipendentemente
dal modello).

## File da modificare (riepilogo)

| File | Riga | Modifica |
|---|---|---|
| `projects/nexo-pwa/public/js/app.js` | 2525 | dedup `finalChunk` con `_mergeFinalChunk` |
| `projects/nexo-pwa/public/js/app.js` | nuovo | funzione helper `_mergeFinalChunk` |
| `projects/iris/functions/handlers/nexus.js` | 1245-1262 | `_looksRepetitive` + check in `shouldAnalyzeTextDirectly` |
| `projects/iris/functions/handlers/nexus.js` | 524 | regex estesi per query generiche "che/quali interventi … data" |
| `projects/iris/functions/handlers/nexus.js` | 1433-1473 | (opz) few-shot domain in `buildOllamaSystemPrompt` |
| `projects/iris/functions/handlers/ares.js` | 226+ | (verifica) gestione `interventi_aperti` senza tecnico |
