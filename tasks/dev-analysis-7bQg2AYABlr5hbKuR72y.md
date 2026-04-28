# Analisi dev-request `7bQg2AYABlr5hbKuR72y`

**Data:** 2026-04-28
**Tipo:** bug_from_chat (2 bug, uno verosimilmente già risolto, l'altro nuovo)
**Sessione:** `nx_jzpo4us5moi694le`

## Sintesi

La conversazione contiene un solo turno utente:
> ALBERTO: "Non funziona la dettatura vocale"
>
> NEXUS: "Hai 4 email urgente. La prima è da Acquisti (A.Nannetti S.r.l.)…"

Da qui escono **due bug indipendenti**:

1. **Bug 1 — Lamentela "non funziona la dettatura vocale"**: Alberto ha
   testato la dettatura e ha rilevato che non funzionava. Probabile race
   tra deploy del fix e segnalazione (il fix `interimResults=false` è
   stato deployato pochi minuti dopo questo report). Esiste comunque un
   problema strutturale collegato a `interimResults=false`.

2. **Bug 2 — Routing completamente sbagliato**: la frase "non funziona
   la dettatura vocale" doveva essere intercettata come dev request, ma
   `isDevRequest` la scarta (1 pattern match, ne servono 2). Cade su LLM,
   Ollama 1.5b allucina `iris/cerca_email_urgenti` e l'utente vede una
   risposta totalmente fuori contesto.

## Timeline (tutti orari Europe/Rome)

- 07:15:34 — Alberto scrive "Non funziona la dettatura vocale" in chat
- 07:15:50 — NEXUS risponde con la lista email urgenti (Bug 2 osservato)
- 07:16:01 — Alberto clicca il bottone 🐛 → dev-request `7bQg2AYABlr5hbKuR72y`
  salvata su Firestore via `submitBugReport` → questa analisi
- 07:24:19 — Commit `528a760` "fix(nexus): dettatura solo finale + …"
- 07:25 (~) — Hosting deploy del fix completato

Il bug è arrivato **8 minuti prima** che la fix dettatura fosse online.
Per chi ricarica la PWA dopo le 07:25, app.js nuovo viene servito (verificato
con `curl https://nexo-hub-15f2d.web.app/js/app.js | grep "interimResults = false"`
→ 1 occorrenza).

---

## Bug 1 — "Non funziona la dettatura vocale"

### Diagnosi A (più probabile): timing del fix

Il fix per Bug A della dev-request precedente (`e9KNWku90w4akhyBr0Ec`) è
arrivato dopo questo bug report. Alberto stava ancora testando il
codice vecchio (con `interimResults=true` che produceva l'accumulo
"victologia victologia un…").

### Diagnosi B (problema strutturale residuo del nuovo fix)

Con `rec.interimResults = false` + `rec.continuous = true`, alcuni
browser:
- **Chrome desktop**: emette final ad ogni pausa breve (1-2s). OK.
- **iOS Safari**: con continuous=true tende a NON emettere final fino a
  che non chiudi esplicitamente la sessione. La dettatura "non risponde"
  finché non premi stop.
- **Chrome Android**: comportamento intermedio. Spesso emette final dopo
  3-5s di silenzio.

Conseguenza: con la fix applicata, l'auto-send timer (`nexusScheduleAutoSend`,
1.5s dopo l'ultimo `onresult`) parte SOLO dopo aver ricevuto un final.
Su iOS senza fine sessione, il final non arriva mai. L'esperienza utente
è "ho parlato e non parte".

### File coinvolti

- `projects/nexo-pwa/public/js/app.js`
  - 2407-2434 — `_mergeFinalChunk` helper (introdotto dal fix)
  - 2510-2545 — `rec.interimResults=false` + `onresult` (introdotto dal fix)
  - 2432-2451 — `nexusScheduleAutoSend` (timer 1.5s post-onresult)
  - 2554-2560 — `rec.onend` ri-avvia automaticamente

### Proposta — soluzione robusta multi-strategy

**Strategia ibrida**: tenere `interimResults=true` MA usare gli interim
SOLO per l'aggiornamento real-time del textarea (feedback visivo),
**senza** triggerare l'auto-send. Solo i final triggerano `nexusScheduleAutoSend`.

Pseudo-codice:

```js
rec.interimResults = true;  // di nuovo true per visual feedback

rec.onresult = (ev) => {
  let interim = "", finalChunk = "";
  for (let i = ev.resultIndex; i < ev.results.length; i++) {
    const r = ev.results[i];
    if (r.isFinal) finalChunk += r[0].transcript;
    else interim += r[0].transcript;
  }
  // Aggiorna SEMPRE textarea (feedback vivo durante la dettatura)
  nexusVoice.interimText = interim.trim();
  if (finalChunk) {
    nexusVoice.finalText = _mergeFinalChunk(nexusVoice.finalText, finalChunk) + " ";
  }
  const ta = $("#nexusInput");
  if (ta) ta.value = (nexusVoice.finalText + nexusVoice.interimText).trim();

  // SCHEDULE AUTO-SEND solo sui FINAL (non interim) → niente accumulo
  if (finalChunk) nexusScheduleAutoSend();
};
```

**Perché funziona**:
- Visual feedback live preservato (Alberto vede cosa dice mentre parla)
- Auto-send dipende SOLO dal final → niente bug "victologia victologia un"
  (gli interim non finiscono in finalText)
- `_mergeFinalChunk` resta come difesa anti-cumulativo
- Su iOS, anche se i final tardano, almeno l'utente vede il testo interim

**Aggiunta consigliata**: timeout massimo per auto-send. Se passano >8s
dall'inizio della dettatura senza alcun final ma c'è interim non vuoto,
forza un commit dell'interim come pseudo-final. Mitiga il caso iOS
"final che non arriva mai".

```js
// Watchdog: se nessun final entro 8s ma c'è interim corposo, forza send
function nexusScheduleVoiceWatchdog() {
  if (nexusVoice._watchdog) clearTimeout(nexusVoice._watchdog);
  nexusVoice._watchdog = setTimeout(() => {
    if (!nexusVoice.active || nexusVoice.paused) return;
    const text = (nexusVoice.finalText + " " + nexusVoice.interimText).trim();
    if (text.length >= 6 && !NEXUS_PENDING) {
      // Promuovi interim a final
      nexusVoice.finalText = (nexusVoice.finalText + " " + nexusVoice.interimText).trim() + " ";
      nexusVoice.interimText = "";
      nexusScheduleAutoSend();
    }
  }, 8000);
}
```

### Alternative

- **A** (proposta): ibrido con interim=true ma auto-send solo su final +
  watchdog 8s.
- **B**: tenere `interimResults=false` come ora, ma ridurre `continuous` a
  `false` su iOS detect → forza il browser a chiudere e emettere final
  dopo silenzio. Compromesso: l'utente deve ri-cliccare mic ogni volta.
- **C**: backend audio (Whisper API o speech-to-text Google Cloud) invece
  di Web Speech API. Effort L, costo non zero.

### Rischi

- L'utente potrebbe percepire l'interim "tremolante" (parole che cambiano
  prima del final) come errore. Mitigazione: stilizzare l'interim in
  italic/grigio nel textarea (richiede contentEditable invece di textarea,
  effort M). Per ora accettabile testo monocromo.
- Watchdog 8s può causare invii prematuri se Alberto fa una pausa lunga
  pensando. Mitigazione: 8s è abbastanza margine; in dettatura tipica le
  pause sono <3s.

### Effort: **M** (45-60 min)

- 20 min: ripristino interim + auto-send solo su final + watchdog
- 10 min: deploy hosting + verifica `curl` deployato
- 15 min: test mobile (iOS + Android se disponibili)

---

## Bug 2 — "Non funziona la dettatura vocale" → "Hai 4 email urgenti"

### Diagnosi

Il messaggio "Non funziona la dettatura vocale" segue questo path nel
nuovo flusso 3-livelli (post commit `ab92ee8`):

1. **`tryInterceptDevRequest`** (`index.js`):
   - `isDevRequest("Non funziona la dettatura vocale")` ritorna **false**
   - Causa: matcha solo 1 pattern (`/\bnon\s+funzion\w+/`), `isDevRequest`
     richiede `matches >= 2` o un trigger esplicito ("vorrei/puoi fare").
   - Risultato: NON intercettato come dev request → flusso normale

2. **`tryAnalyzeLongText`**: 33 caratteri → sotto soglia 200 → skip

3. **Regex L1 (`tryDirectAnswer` con intent vuoto)**: nessuna regex matcha
   - Non c'è "urgent", "intervent", "mail", saluto, ecc.

4. **`callIntentRouter` (Haiku → Ollama)**:
   - Anthropic Haiku → 400 (balance esaurito da 24h)
   - Fallback Ollama qwen2.5:1.5b
   - Allucinazione: ritorna probabilmente
     `{"collega":"iris","azione":"cerca_email_urgenti","rispostaUtente":"…"}`
     (il modello vede "non funziona" e probabilmente associa a "problema
     → urgente → email urgenti", logica plausibile ma sbagliata)

5. **`tryDirectAnswer` post-LLM**: matcha
   `match: (col, az) => col === "iris" && /urgen/.test(az)` (`nexus.js:394`)
   → esegue `handleContaEmailUrgenti` → "Hai 4 email urgente. La prima è
   da Acquisti…"

### File coinvolti

- `projects/iris/functions/handlers/nexus.js:1109-1142` —
  `DEV_REQUEST_PATTERNS`, `isDevRequest` (la fix principale)
- `projects/iris/functions/handlers/nexus.js:1428-1496` —
  `buildOllamaSystemPrompt` (mitigazione secondaria: ridurre allucinazioni)
- `projects/iris/functions/handlers/nexus.js:394` —
  DIRECT_HANDLERS iris/urgenti (riceve l'allucinazione)

### Proposta

**Step 1 — Estendere `isDevRequest`** per intercettare le lamentele
"non funziona X" come dev request anche con un solo pattern match.
Logica: la frase "non funziona [qualcosa]" è SEMPRE un bug report
(non c'è altro intent ragionevole), quindi promuovere il pattern 3
a "trigger esplicito" come `vorrei/puoi fare`.

```js
// nexus.js:1138-1141 (modifica)
function isDevRequest(userMessage) {
  // ... exclusion checks ...
  let matches = 0;
  for (const re of DEV_REQUEST_PATTERNS) {
    if (re.test(t)) matches++;
    if (matches >= 2) return true;
  }
  // Trigger espliciti (1 match basta)
  if (/\b(vorrei|puoi\s+fare|puoi\s+aggiungere|serve\s+che|mi\s+serve|fammi|crea\w*)\b/i.test(t)) return true;
  // ↓ NUOVO: "non funziona X" è sempre dev request (X = qualunque oggetto)
  if (/\bnon\s+(funzion\w+|va\b|parte\b|carica\w+)\s+\w/i.test(t)) return true;
  return false;
}
```

Il `\s+\w` finale evita falsi positivi su "non funziona così" o "non va
bene" (frasi di feedback, non bug report).

**Step 2 — Mitigare allucinazioni Ollama** estendendo
`buildOllamaSystemPrompt` con esempi negativi:

```
- "non funziona X" → nessuno (azione=chiarimento, rispostaUtente="Lo
  segnalo come bug e lo risolviamo. Cosa fa esattamente?")
- "ho un problema con X" → nessuno (chiarimento)
- "X è rotto" → nessuno
```

E rinforzare in cima al prompt la regola: "Se il messaggio è una
lamentela, problema, malfunzionamento o richiesta di sviluppo (verbi:
non funziona, è rotto, vorrei, aggiungere, modificare, fix, cambiare),
collega = nessuno con azione = chiarimento. NON inventare un collega
plausibile."

**Step 3 (opzionale) — Pre-Anthropic check su balance**: se la chiamata
Haiku ritorna 400 con `balance_too_low`, in `callIntentRouter` aggiungere
un check euristico **prima** del fallback Ollama: se il messaggio matcha
un set ridotto di pattern "lamentela / sviluppo" non coperti da regex L1,
ritornare un intent fisso `{collega:"nessuno", azione:"chiarimento",
rispostaUtente:"..."}` invece di sprecare 18s su Ollama che allucina.

### Rischi

- Step 1: i pattern "non funziona" potrebbero matchare frasi legittime
  come "non funziona così, riprova" (l'utente sta dando feedback su una
  risposta NEXUS). Mitigazione: il `\s+\w` richiede una parola successiva,
  e DEV_REQUEST_EXCLUSION già copre "ok/no/sì/va bene" iniziali. Da
  monitorare nei log se ci sono falsi positivi.
- Step 2: estendere il prompt Ollama allunga la latency del fallback
  (ogni token in più ~50ms su CPU). Trade-off accettabile per evitare
  routing assurdo.
- Step 3: aggiungere logica al fallback aumenta superficie del bug
  router. Da fare solo se Step 1+2 non sono sufficienti.

### Alternative

- **A** (proposta): step 1 obbligatorio, step 2 consigliato.
- **B**: solo step 1, accettando che il fallback Ollama allucini quando
  il messaggio non matcha né regex L1 né dev request.
- **C**: pattern matching più estensivo PRE-LLM per catturare anche
  "ho un problema", "è rotto", "non riesco a", ecc. Effort S ma rischio
  falsi positivi su normale conversazione.

### Effort: **S** (15-30 min)

- 5 min: aggiungere il pattern in `isDevRequest`
- 10 min: deploy + test FORGE su 4-5 frasi "non funziona X"
- 10-15 min (opzionale): estendere `buildOllamaSystemPrompt` step 2

---

## Riepilogo proposta

| Bug | Severità | Effort | Priorità |
|---|---|---|---|
| **1** dettatura vocale (timing + iOS) | Alta (feature core mobile) | M | 2 |
| **2** "non funziona X" → email urgenti | Alta (UX surreale) | S | 1 |

**Ordine consigliato**: Bug 2 prima (effort S, fix immediata), poi Bug 1
(effort M, richiede test mobile reale).

**Test plan**:

1. **Bug 2 (FORGE)**:
   ```bash
   for msg in "non funziona la dettatura vocale" \
              "non funziona il bottone interventi" \
              "non parte la chat" \
              "il microfono è rotto"; do
     curl /nexusTestInternal -d "{\"sessionId\":\"forge-test-bug2\",\"message\":\"$msg\"}"
   done
   ```
   Atteso per i primi 3: stato `dev_request_registered` (non `iris/urgenti`).
   "Microfono è rotto" può fallire (manca pattern "non funziona") — caso
   limite accettabile.

2. **Bug 1 (mobile)**: deploy + testare PWA su iOS Safari + Chrome
   Android dettando frasi medie ("Federico ha intervento al Kristal
   domani mattina") e verificare che (a) l'interim si veda mentre parli,
   (b) l'auto-send parta entro ~3s dalla fine della frase, (c) non si
   accumulino ripetizioni cumulative nel testo finale.

## Stato collaterale

- Anthropic Haiku ancora -0.03 USD da 36h. Tutti i pattern non coperti
  da regex L1 cadono su Ollama 1.5b → soggetti ad allucinazione (Bug 2 ne è
  esempio). La fix isDevRequest è cruciale finché Anthropic non torna online,
  perché copre la classe più frequente di bug report da chat.
- La fix dettatura della dev-request precedente
  (`e9KNWku90w4akhyBr0Ec`) ha effetto solo per chi ha ricaricato la PWA
  dopo le 07:25 di oggi. Il SW (`nexo-shell-v5`) è network-first per
  HTML/JS/CSS, quindi un refresh della pagina basta — ma se Alberto ha
  visto questo bug prima del deploy, era ancora con app.js v4.

## File da modificare (riepilogo)

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 1140 | trigger 1-match per "non funziona X" |
| `projects/iris/functions/handlers/nexus.js` | 1428+ (opz) | esempi negativi in `buildOllamaSystemPrompt` |
| `projects/nexo-pwa/public/js/app.js` | 2510 | `interimResults=true` di nuovo |
| `projects/nexo-pwa/public/js/app.js` | 2520 | onresult ibrido (interim per UI, final per auto-send) |
| `projects/nexo-pwa/public/js/app.js` | nuovo | `nexusScheduleVoiceWatchdog` 8s |
