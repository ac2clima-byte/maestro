# fix(nexus): routing dev-request lamentele + dettatura ibrida

**Data:** 2026-04-28
**Bug ID:** `7bQg2AYABlr5hbKuR72y` (2 bug correlati)

## Bug 2 — "Non funziona la dettatura vocale" → "Hai 4 email urgenti"

### Causa
`isDevRequest` in `nexus.js` richiedeva 2+ pattern match per dichiarare
una frase come dev request. "Non funziona la dettatura vocale" matcha solo
il pattern "non funziona/va/parte/carica" → `isDevRequest=false` → cade su
LLM → Ollama 1.5b allucina `iris/cerca_email_urgenti` → handler ARES e
IRIS rispondono fuori contesto.

### Fix
1. **`isDevRequest`**: promuovere "non funziona X" a trigger 1-match con
   distinzione fra:
   - **lamentele reali**: `non funziona/va/parte/carica/risponde [oggetto]`
     → dev request
   - **feedback**: stesse parole + avverbio finale (`bene/così/affatto/
     mai/granché` o `più/sempre/molto/tanto` a fine frase) → NO dev request

   Note implementative: vocali accentate (così/più) non funzionano dentro
   `\b` o `\w` di JS regex → ho usato lookahead `(?=\s|$|[,.?!])` come
   terminatore esplicito.

2. **`forge.js`**: aggiunto `tryInterceptDevRequest` come primo intercept
   dopo `ensureNexusSession`. Senza questo, i test FORGE bypassavano del
   tutto il path dev request → impossibile testare il fix.

3. **`tryInterceptDevRequest`**: skip Firestore writes per sessioni
   `forge-test-*`. Altrimenti ogni test creerebbe un DEV-NNN reale e il
   poller pusherebbe un `tasks/dev-request-DEV-NNN.md` su GitHub.

### Test FORGE — 7/7 PASS

| # | Messaggio | Esito | Tempo |
|---|---|---|---|
| 1 | Non funziona la dettatura vocale | dev_request | 2.9s |
| 2 | non funziona il bottone interventi | dev_request | 1.9s |
| 3 | non parte la chat | dev_request | 0.9s |
| 4 | non si carica la pagina | dev_request | 0.8s |
| 5 | non funziona così (regression) | NO dev_request | 18.3s (Ollama) |
| 6 | ciao (regression) | regex saluto | 1.2s |
| 7 | interventi di Marco oggi (regression) | regex ARES | 4.8s |

Prima del fix il caso #1 produceva "Hai 4 email urgenti…" (allucinazione
Ollama). Ora restituisce "Ho registrato la richiesta DEV-XXX: …" come
qualsiasi altra dev request.

### Test offline (node) — `isDevRequest` 13/13 PASS

```
✅ "Non funziona la dettatura vocale"     → true
✅ "non funziona il bottone interventi"   → true
✅ "non parte la chat"                    → true
✅ "non si carica la pagina"              → true
✅ "non risponde più il sito"             → true
✅ "non funziona"                         → true
✅ "non va bene"                          → false
✅ "non funziona così"                    → false
✅ "non funziona più"                     → false
✅ "non funziona più."                    → false
✅ "non va affatto"                       → false
✅ "non risponde più"                     → false
✅ "non risponde sempre"                  → false
```

---

## Bug 1 — Dettatura vocale "non funziona"

### Causa
Il fix precedente (`fix(nexus): dettatura solo finale + …`, commit `528a760`)
imponeva `interimResults=false` per evitare il bug "victologia cumulativo".
Effetto collaterale: su iOS Safari + `continuous=true`, il browser può non
emettere mai un final fino alla chiusura della sessione → l'auto-send
non parte → "non funziona".

### Fix — strategia ibrida
1. **`interimResults=true`** di nuovo, MA:
   - Gli interim aggiornano il textarea (feedback live durante la
     dettatura) ma **NON** triggerano `nexusScheduleAutoSend`.
   - Solo i final entrano in `finalText` (via `_mergeFinalChunk`) e
     schedulano l'auto-send.

2. **Watchdog 8s** (`nexusScheduleVoiceWatchdog`): se passano 8s senza
   alcun final ma c'è interim corposo (≥6 char), promuove l'interim a
   final e triggera l'auto-send. Mitiga il caso iOS "final che non arriva
   mai" senza penalizzare i browser che si comportano bene.

### File modificati

| File | Righe | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 1140-1153 | `isDevRequest` con pattern lamentele + esclusioni feedback |
| `projects/iris/functions/handlers/nexus.js` | 1191-1228 | `tryInterceptDevRequest` skip Firestore per FORGE |
| `projects/iris/functions/handlers/forge.js` | 24-26, 99-122 | aggiunto `tryInterceptDevRequest` come primo intercept |
| `projects/nexo-pwa/public/js/app.js` | 2404, 2461-2484 | watchdogTimer + `nexusScheduleVoiceWatchdog` |
| `projects/nexo-pwa/public/js/app.js` | 2540-2575 | `interimResults=true`, `onresult` ibrido |
| `projects/nexo-pwa/public/js/app.js` | 2643, 2655 | cleanup watchdog in pause/stop |
| `projects/nexo-pwa/public/sw.js` | 11 | CACHE_NAME v5 → v6 |

## Deploy

- Functions: `nexusRouter`, `nexusTestInternal` (europe-west1)
- Hosting: `nexo-hub-15f2d.web.app` (PWA, SW v6)

## Stato generale

- **Bug 2 risolto**: tutti i "non funziona X" intercettati come dev request
  in <3s, senza passare da LLM (zero costo, zero allucinazioni).
- **Bug 1 — Mitigato**: `interimResults=true` ripristina il feedback live;
  `_mergeFinalChunk` continua a difendere dal cumulativo final; watchdog
  8s copre il caso iOS final-mancante. Va validato su device fisico —
  Chrome desktop non riproduce il problema iOS.
- Anthropic Haiku ancora -0.03 USD: il fallback Ollama 1.5b non viene
  più usato per "non funziona X" perché il path è interrotto da
  `tryInterceptDevRequest` prima del routing LLM.

## Test plan utente

1. Apri PWA su iPhone (Safari) o Android Chrome.
2. Forza refresh (Ctrl+Shift+R o Pull-to-refresh): SW v6 carica nuovo
   app.js con `interimResults=true`.
3. Apri NEXUS Chat, premi mic, detta "Federico ha un intervento al
   Kristal domani mattina".
4. Verifica:
   - Mentre parli, vedi il testo apparire in tempo reale nel textarea
   - Quando finisci, dopo ~1.5s parte l'invio
   - Niente accumulo "victologia victologia un…"
5. Se invece detti una frase media e il browser non emette mai final
   (caso iOS edge), entro 8s parte comunque l'invio (watchdog).
