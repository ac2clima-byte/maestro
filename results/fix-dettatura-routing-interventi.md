# fix(nexus): dettatura solo finale + routing interventi senza tecnico

**Data:** 2026-04-28
**Bug ID:** `e9KNWku90w4akhyBr0Ec` (3 bug correlati nella stessa sessione)

## Bug A — Dettatura vocale che cumulava trascrizioni interim

### Causa
Web Speech API su mobile (iOS Safari, Chrome Android) emetteva ripetuti
`isFinal=true` con trascrizioni cumulative crescenti. Il codice
`projects/nexo-pwa/public/js/app.js:2522-2525` concatenava ogni final chunk
senza dedup → `finalText` cresceva come "victologia" + "victologia un" +
"victologia un intervento" + …

### Fix
1. `rec.interimResults = false`: il browser emette **un solo** final per
   utterance, non più stream di interim. Elimina la classe del bug alla
   radice.
2. Helper `_mergeFinalChunk(existingFinal, newChunk)` come difesa: se il
   nuovo chunk inizia con l'ultimo segmento di `finalText` (≥4 char),
   sostituisce invece di appendere. Copre i motori SR che producono
   final cumulativi anche con `interimResults=false`.

File: `projects/nexo-pwa/public/js/app.js:2407-2434` (helper),
`2520-2545` (onresult riscritto). SW cache bumpata `nexo-shell-v4 → v5`.

### Test offline (node)
```
+ "victologia"                              → "victologia"
+ "victologia un"                           → "victologia un"      (sostituisce)
+ "victologia un intervento"                → "victologia un intervento"
+ "victologia un intervento il 27 aprile"   → "victologia un intervento il 27 aprile"
```
vs frasi separate genuine (non sostituisce):
```
+ "Marco ha un intervento."                 → "Marco ha un intervento."
+ "domani al Kristal."                      → "Marco ha un intervento. domani al Kristal."
```

### Test live
Richiede device mobile con Chrome/Safari. Verifica che dettando
"Federico ha un intervento domani" il textarea NEXUS contenga
esattamente la frase, non una concatenazione gonfia.

---

## Bug A2 — `tryAnalyzeLongText` analizzava il rumore vocale

### Causa
Il rumore prodotto da Bug A (700+ char di sequenze ripetute) entrava in
`shouldAnalyzeTextDirectly` (`nexus.js:1245-1262`): >200 char + nessuna
parola-domanda → `tryAnalyzeLongText` → Haiku/Ollama che cercavano di
estrarre `mittente/riepilogo` e ritornavano risposte assurde tipo
"Ho letto il messaggio di sconosciuto."

### Fix
Aggiunto helper `_looksRepetitive(t)`: rapporto parole-uniche / parole-totali.
Se `<0.3` con almeno 20 parole, è quasi certamente rumore vocale ripetitivo.
In `shouldAnalyzeTextDirectly`, se `_looksRepetitive` è true E non ci sono
marker email (`>`, `wrote`, `Da:`) → `return false` (non analizzare).

File: `projects/iris/functions/handlers/nexus.js:1245-1280`.

### Test offline (node)
- Rumore vocale (sequenza victologia × 16) → `_looksRepetitive: true` ✅
- Domanda lunga reale ("Quante email ho ricevuto oggi…") → `false` ✅
- Email reale incollata ("Buongiorno Alberto, in merito…") → `false` ✅

### Test live (FORGE)
```
POST /nexusTestInternal {sessionId:"forge-test-bugA2", message:"<rumore>"}
→ NON ritorna "Ho letto il messaggio di sconosciuto"
→ Il path tryAnalyzeLongText è bypassato (verificato dal modello usato:
  qwen2.5:1.5b@ollama, non claude-haiku-4-5 di analyze)
```

Nota: dopo il bypass di Bug A2, il rumore cade comunque sul routing
normale (regex L1 → no match → Ollama 1.5b allucinazione). Ma con
Bug A risolto a monte, Alberto non vedrà mai più rumori arrivare al
backend.

---

## Bug B — "Che interventi ci sono oggi" → `crea_intervento`

### Causa
La query "Che interventi ci sono oggi" non matchava nessun regex L1 in
`DIRECT_HANDLERS` (manca tecnico, manca pattern "interventi di X",
"interventi" non è seguito direttamente da "oggi"). Cadeva su Ollama
1.5b → allucinazione `azione=crea_intervento` → handler chiede tecnico/
data/condominio mancanti.

### Fix
Estesi i regex L1 di `handleAresInterventiAperti` (`nexus.js:514-524`)
per coprire query generiche senza tecnico:

```js
const dataRe = /\b(oggi|domani|dopodomani|ieri|stamattina|stamane|stasera|
  stanotte|lunedì|...|\d{1,2}[\/-]\d{1,2})\b/i;

// Pattern 1: "che/quali/quanti/cosa interventi … data"
if (/\b(che|quali|quanti|cosa|come)\b.*\bintervent[io]\b/i.test(m)
    && dataRe.test(m)) return true;

// Pattern 2: "interventi … data" (anche con parole intermedie)
if (/\bintervent[io]\b/i.test(m) && dataRe.test(m)) return true;

// Pattern 3: "ci sono / abbiamo / c'è interventi"
if (/\b(?:ci\s+sono|c['’]\s*è|c['’]\s*sono|abbiamo)\b
     .*\bintervent[io]\b/i.test(m)) return true;
```

`isCreaInterventoCommand(m)` a riga 512 protegge dalla creazione: query
con verbi "metti/crea/programma" cadono su `handleAresCreaIntervento`
prima ancora di valutare i nuovi regex.

`handleAresInterventiAperti` già aveva il branch `byListName` per il
caso senza tecnico (query su `listName=="INTERVENTI"` limit 800), quindi
nessuna modifica al handler stesso.

### Test live (FORGE)
| # | Messaggio | Source | Esito |
|---|---|---|---|
| B1 | che interventi ci sono oggi | regex | ✅ ARES, "Nessun intervento oggi" |
| B2 | quali interventi domani | regex | ✅ ARES, "Nessun intervento domani" |
| B3 | ci sono interventi oggi? | regex | ✅ ARES |
| B4 | abbiamo interventi domani | regex | ✅ ARES |
| B5 | metti intervento a Federico domani al Kristal | ares_crea | ✅ regression OK (creazione) |

Nessuna regressione su saluti / interventi-di-tecnico / mail.

---

## Riepilogo modifiche file

| File | Righe | Modifica |
|---|---|---|
| `projects/nexo-pwa/public/js/app.js` | 2407-2434 | nuovo helper `_mergeFinalChunk` |
| `projects/nexo-pwa/public/js/app.js` | 2520-2545 | `rec.interimResults=false` + onresult riscritto |
| `projects/nexo-pwa/public/sw.js` | 11 | CACHE_NAME v4 → v5 |
| `projects/iris/functions/handlers/nexus.js` | 1245-1280 | `_looksRepetitive` + check |
| `projects/iris/functions/handlers/nexus.js` | 514-528 | regex L1 estesi per query generiche |

## Deploy

- Functions: `nexusRouter`, `nexusTestInternal` (europe-west1)
- Hosting: `nexo-hub-15f2d.web.app` (PWA)

## Test PASS

| Bug | Tipo test | Risultato |
|---|---|---|
| A | Unit `_mergeFinalChunk` (node) | 6/6 ✅ |
| A2 | Unit `_looksRepetitive` (node) | 3/3 ✅ |
| A2 | FORGE rumore non finisce in analyze | ✅ |
| B | FORGE 4 query generiche → ARES regex | 4/4 ✅ |
| B | Regression "metti intervento" → crea | ✅ |
| - | Regression saluto/interventi-di-X/mail | ✅ |

## Note

- Anthropic Haiku ancora a -0.03 USD: i test cadono su Ollama fallback,
  ma le fix L1 evitano del tutto LLM per i pattern frequenti.
- Bug A è la causa upstream di A2: con A risolto, A2 è una rete di sicurezza.
- `interimResults=false` toglie ad Alberto il feedback "vedo cosa sto
  dicendo in tempo reale". Trade-off accettabile: meglio testo pulito
  alla fine che testo sporco in real-time.
