# Dev Analysis — DEV-001

Data analisi: 2026-04-29
Source: `tasks/dev-request-DEV-001.md` (Type: generic, sessione `nx_1r1cjjspmokefb65`)
Richiesta letterale: *"Nella pva la dettatura vocale non funziona"* (refuso "pva" = PWA NEXO).

## 1. Diagnosi

"Non funziona" è ambigua: possono essere 5 sintomi diversi. Mappo
ogni sintomo a una causa probabile, dal più probabile al meno.

### S1 — Bottone 🎤 INVISIBILE (probabile)

In `projects/nexo-pwa/public/index.html:162`:

```html
<button id="nexusMicBtn" class="nexus-btn-icon" aria-label="Detta la richiesta" title="Dettatura vocale" hidden>🎤</button>
```

Il bottone ha attributo `hidden` di default. La logica di
visibilità è **interamente** in JS:
`projects/nexo-pwa/public/js/app.js:2674` → `mic.hidden = false`,
chiamata da `nexusMicWireWhenReady()` (riga 2669-2688) e dal IIFE
in fondo a riga 2689.

Se per QUALSIASI motivo il modulo `app.js` non raggiunge la riga
2689 (errore syntactic in qualsiasi punto sopra, throw asincrono
durante import dynamici, errore CSS che blocca il rendering),
il bottone resta INVISIBILE → utente vede UI senza microfono →
"non funziona" è un buon modo per descriverlo.

**Verifica empirica richiesta**: Alberto deve aprire DevTools
> Console, cercare l'errore JS prima di `[nexus-voice] click mic …`.
Se non c'è quel log, il bottone non è mai stato wired.

### S2 — REGRESSION: `interimResults=true` re-introdotto (probabile, recente)

Il commit `528a760c` del 28/04 alle 07:24 ha esplicitamente
impostato `rec.interimResults = false` per **risolvere un bug
documentato** di iOS/Chrome mobile che produceva testo gonfio:
> "victologia" → "victologia un" → "victologia un intervento"

UN'ORA DOPO (28/04 08:20), il commit `28715579 auto: pre-pull
commit` ha **invertito** la decisione, ripristinando
`rec.interimResults = true` (vedi `app.js:2568`).

Probabilmente è stato l'auto-pull di MAESTRO che ha riconciliato
modifiche unstaged della macchina di Alberto (lavoro WIP
precedente al fix). Il commento "CRUCIALE: gli interim NON entrano
in finalText e NON triggerano l'auto-send" promette correttezza
ma **non è quello che l'utente sperimenta** se il browser emette
final cumulativi (iOS Safari fa esattamente questo — vedi log del
fix originale).

Sintomo per l'utente: dettatura "parte", ma quando termina la
frase il testo nell'input è duplicato, gonfio, o si auto-invia
prima del previsto. L'utente conclude "non funziona".

### S3 — PWA standalone su iOS = no SpeechRecognition (probabile su mobile)

`manifest.json:8` ha `"display": "standalone"`. Quando Alberto
installa la PWA su iOS (Aggiungi a Schermata Home), si apre in
WKWebView standalone — e in quella modalità **`webkitSpeechRecognition`
è ASSENTE** (limitazione Apple, non bug NEXO).

`nexusVoiceSupported()` ritorna `false`. Il codice corretto a
`app.js:2675-2678` aggiunge classe `nexus-btn-disabled` e cambia
title in "Usa Chrome o Edge". Ma il bottone resta cliccabile e al
click NON parte niente (nexusVoiceStart riga 2530 esce subito
dopo aver mostrato "Usa Chrome o Edge per la dettatura vocale.").

Sintomo per l'utente: clicca ma non succede nulla, oppure vede
messaggio "Usa Chrome o Edge" che è confondente perché lui sta
GIÀ usando Safari iOS che non funziona standalone.

### S4 — Permission microfono negato/revocato (possibile)

Già gestito in `nexusPreflightMic` (app.js:2508-2527). Ma se il
permesso era stato concesso e poi revocato, `sessionStorage` ha
ancora il flag `nexo.mic.granted=1` e il preflight viene saltato
(riga 2540-2541), portando direttamente a `nexusVoiceResume()` che
fallirà silenziosamente o con `not-allowed`.

`onerror` riga 2616 svuota il flag (`sessionStorage.removeItem`),
ma solo dopo il primo errore. Il primo tentativo di dettatura
fallisce senza messaggio chiaro all'utente.

### S5 — Cache stale (improbabile ma possibile)

Cache busting in `index.html` è `?v=v10` per `app.js` e nelle
`headers` di `firebase.json:14` c'è `Cache-Control: no-cache`.
SW è network-first (sw.js:63-75). Tutti accorgimenti corretti.

Però se Alberto ha installato la PWA settimane fa e non ha mai
fatto hard-reload, può avere ancora un app.js molto vecchio in
WebView cache iOS (notoriamente aggressiva, ignora gli header in
alcuni casi). `caches.keys().then(...)` come da CLAUDE.md può
risolverlo.

## 2. File coinvolti

| File:riga | Cosa fa | Cosa modificare |
|-----------|---------|-----------------|
| `projects/nexo-pwa/public/index.html:162` | `<button hidden>` di default | Rimuovere attributo `hidden` (e gestire visibilità SOLO via JS-disabled state, non hidden) |
| `projects/nexo-pwa/public/js/app.js:2568` | `rec.interimResults = true` | Rimettere `false` (regression del 28/04 alle 08:20, vedi commit 28715579) |
| `projects/nexo-pwa/public/js/app.js:2530-2535` | Messaggio non-supported "Chrome o Edge" | Migliorare wording per iOS standalone: distinguere "Safari ma in PWA installata" da "browser desktop diverso" |
| `projects/nexo-pwa/public/js/app.js:2540-2550` | sessionStorage cache permesso | Quando `onerror = "not-allowed"`, già fa `removeItem` (riga 2616). OK |
| `projects/nexo-pwa/public/index.html:167` | cache busting `?v=v10` | Bumpare a `?v=v11` dopo il fix |
| `projects/nexo-pwa/public/sw.js:11` | `CACHE_NAME = "nexo-shell-v6"` | Bumpare a `v7` per forzare rebuild SW |

## 3. Proposta

Ordine consigliato: dal fix più certo (con evidenza diretta) ai
fix preventivi.

### P1 — Ripristino `interimResults=false` (S, basso rischio)

In `app.js:2568`:

```js
// Prima:
rec.interimResults = true;
// Dopo:
rec.interimResults = false;
```

E aggiornare il commento sopra per spiegare la decisione (riferimento
al fix 528a760c del 28/04 e alla regression 28715579 di un'ora dopo).

**Conseguenza**: niente feedback visivo "live" durante la dettatura
(l'utente non vede le parole che digita finché non finisce la frase).
Trade-off accettato dal fix originale: testo pulito > feedback live.

Effetto immediato: risolve il bug "victologia un intervento" su
iOS/Chrome mobile.

### P2 — Bottone NON `hidden` di default (S, basso rischio)

In `index.html:162`:

```html
<!-- Prima: -->
<button id="nexusMicBtn" class="nexus-btn-icon" aria-label="Detta la richiesta" title="Dettatura vocale" hidden>🎤</button>
<!-- Dopo: -->
<button id="nexusMicBtn" class="nexus-btn-icon" aria-label="Detta la richiesta" title="Dettatura vocale">🎤</button>
```

Rimosso l'attributo `hidden`. Pattern attuale: bottone visibile
SEMPRE; se SR non supportato, il JS aggiunge classe
`nexus-btn-disabled` (CSS già presente in main.css:1607-1612).

Rimuovere anche la riga `mic.hidden = false` da app.js:2674
(diventa no-op dopo P2, ma lasciarla è inoffensivo).

Effetto: anche se app.js non riesce a wireare il bottone (errore
JS, modulo non caricato, ecc.), l'utente vede comunque il bottone
🎤. Click → fallback nativo HTML (apre tastiera dettatura iOS).

### P3 — Messaggio "non supported" più chiaro (S, basso rischio)

In `app.js:2534`:

```js
// Prima:
nexusSetVoiceStatus("Usa Chrome o Edge per la dettatura vocale.", "error");
// Dopo:
const isPWAStandalone = window.matchMedia("(display-mode: standalone)").matches;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
let msg;
if (isPWAStandalone && isIOS) {
  msg = "La dettatura non funziona quando NEXO è installata come PWA su iPhone/iPad. Apri NEXO in Safari (icona compass del browser, non quella della home).";
} else if (isIOS) {
  msg = "Su iPhone/iPad la dettatura funziona solo in Safari (non in altre app/browser). In alternativa, usa la tastiera con il microfono integrato.";
} else {
  msg = "Usa Chrome o Edge per la dettatura vocale (Firefox/Safari desktop non la supportano completamente).";
}
nexusSetVoiceStatus(msg, "error");
```

Effetto: l'utente capisce ESATTAMENTE perché il bottone non
risponde, invece di pensare "non funziona" generico.

### P4 — Cache busting bump (S, banale)

In `index.html:17` e `:167`:
```html
<link rel="stylesheet" href="css/main.css?v=v11">
<script type="module" src="js/app.js?v=v11"></script>
```

In `sw.js:11`:
```js
const CACHE_NAME = "nexo-shell-v7";
```

Effetto: utenti con cache vecchia ottengono il fix al prossimo
caricamento.

### P5 (opzionale) — Logging diagnostico più verboso (S)

In `app.js:2682` aggiungere:

```js
console.log("[nexus-voice] click mic — supported:", nexusVoiceSupported(),
  "active:", nexusVoice.active,
  "standalone:", window.matchMedia("(display-mode: standalone)").matches,
  "ua:", navigator.userAgent.slice(0, 80));
```

Quando Alberto dice "non funziona", chiedergli di aprire DevTools
e copiare quel log. Diagnostica immediata della modalità + browser.

## 4. Rischi e alternative

### Rischi

- **R1 (P1)** — `interimResults=false` rimuove il feedback "live"
  che alcuni utenti potrebbero apprezzare. Mitigazione: la
  modalità "conversazione continua" (`active=true`) è progettata
  per parlare e ascoltare, non per leggere il testo che digita.
  Il feedback visivo è SOLO il bottone rosso pulsante + status
  "🔴 ti ascolto…". Tradeoff accettato dal fix originale.

- **R2 (P2)** — Rimuovere `hidden` significa che su rendering iniziale
  il bottone appare per ~50ms anche se il JS poi lo nasconderà
  (non lo nasconde mai in realtà, ma la classe `disabled` cambia
  stile). Flicker minimo, accettabile.

- **R3 (P3)** — Il messaggio iOS-aware si basa su user-agent
  sniffing (`/iPad|iPhone|iPod/`). Apple sta deprecando l'UA per
  privacy. Mitigazione: combinare UA con `display-mode` query
  che è più affidabile per "PWA standalone".

- **R4** — Cache busting bump (P4) richiede deploy hosting. Se
  Alberto ha SW vecchio, il primo caricamento dopo il deploy
  potrebbe ancora servire vecchio app.js (race con SW activation).
  Mitigazione: il SW è network-first, quindi il refresh
  successivo cattura subito il nuovo.

- **R5** — Se la causa root è S3 (PWA standalone iOS = no SR),
  P1+P2+P3 NON risolvono il bug ma migliorano solo il messaggio.
  L'unico fix vero per S3 è una soluzione alternativa: usare
  l'API Whisper già esistente in `nexusTranscribeAudio` con
  registrazione audio → upload → trascrizione server-side.
  Costoso (~$0.006/min) ma funziona ovunque.

### Alternative

- **A1 — Solo P1 + P2** (rapido): risolve i 2 sintomi più
  probabili senza nuovo codice. Effort < 30 min. Raccomandato come
  primo intervento.

- **A2 — Aggiungere fallback Whisper server-side**: quando SR non
  è disponibile, registra audio via MediaRecorder e mandalo a
  `nexusTranscribeAudio`. Pro: funziona ovunque (incluso PWA
  standalone iOS). Contro: latenza 2-5s, costo per minuto, serve
  OPENAI_API_KEY (già configurato per audio chiamate). Effort: M.

- **A3 — Sostituire SR con Whisper SEMPRE**: rimuovere il path
  Web Speech API. Più costoso ma uniforme. Sconsigliato se SR
  funziona su Chrome desktop (95% dei casi Alberto).

**Raccomandazione**: P1 + P2 + P4 (cache bump) prima. Se Alberto
conferma che il bug non è più riproducibile dopo deploy → P3 (UX
del messaggio) per copertura completa. P5 logging in qualsiasi
momento (zero rischio). A2 (Whisper fallback) come long-term per
chi usa la PWA installata su iOS.

## 5. Effort

| Step | Effort | Test richiesto |
|------|--------|----------------|
| P1 — `interimResults=false` | **S** (5 min) | Test FORGE su Chrome desktop: dettare "questo è un test" → verificare testo finale = "questo è un test" (no duplicati). |
| P2 — Rimuovere `hidden` HTML | **S** (5 min) | Verificare che bottone sia visibile al primo caricamento (anche con JS disabled). |
| P3 — Messaggio iOS-aware | **S** (15 min) | Test su iOS Safari (mobile/standalone) + Chrome desktop. |
| P4 — Cache busting bump | **S** (5 min) | Deploy hosting. |
| P5 — Logging diagnostico | **S** (10 min) | Nessun test, solo console output. |
| A2 — Whisper fallback (long-term) | **M** (3-4h) | Test multi-piattaforma + verifica costi quota OpenAI. |

**Totale per P1-P5**: **S** (mezza giornata inclusi test e deploy).
**Per A2** in aggiunta: **M**.

### Test FORGE consigliati post-fix

```
Browser test matrix (manuale, da Alberto):
1. Chrome desktop (Win/Mac):
   - Click 🎤 → bottone rosso pulsante → "ti ascolto…"
   - Detta "test della dettatura vocale"
   - Auto-invio dopo 1.5s silenzio → testo nell'input = "test della dettatura vocale"
   - PASS se testo identico (no "test test" o "test della della").

2. Chrome Android:
   - Stessa sequenza di sopra.
   - Verifica anche che il watchdog 8s funzioni (interim → final).

3. Safari iOS (browser, NON standalone):
   - SR è esposta come webkitSpeechRecognition. Funziona ma con bug noti.
   - Verifica messaggio chiaro se permesso negato.

4. PWA standalone iOS:
   - SR ASSENTE → messaggio P3 "La dettatura non funziona quando NEXO
     è installata come PWA su iPhone…".
   - Bottone NON deve sparire ma diventare "disabled" visualmente.

5. Edge desktop:
   - Stessa esperienza di Chrome (entrambi Chromium).

Negativi:
6. Firefox desktop:
   - SR non supportata → messaggio P3 "Usa Chrome o Edge…".
```

## 6. Note operative

- Nessuna modifica backend, solo PWA frontend.
- Deploy: `cd projects/nexo-pwa && firebase deploy --only hosting`.
- Cache busting bump in `index.html` + `sw.js` PRIMA del deploy.
- Dopo deploy chiedere ad Alberto:
  ```js
  // In console PWA:
  caches.keys().then(keys => keys.forEach(k => caches.delete(k))); location.reload(true);
  ```
- Compatibile con migrazione Anthropic→Groq (zero overlap).

### Storia precedente (per contesto)

Già 1 fix dettatura il 26/04 (commit `8b9dc366` "result:
fix-dettatura-vocale" + commit `467aafd6`). Già 2 task storici:
- `tasks/fix-dettatura-vocale.md`
- `tasks/fix-dettatura-e-routing-3bug.md`

Il commit `528a760c` (28/04) ha il fix più importante per il bug
"testo cumulativo iOS". È stato **regredito 1 ora dopo** dall'auto-pull
MAESTRO (`28715579`). Vale la pena verificare con Alberto se quella
regression era intenzionale (se sì, ci serve un'altra strategia
per il bug iOS).

Niente da implementare ora, come da istruzioni del task.
