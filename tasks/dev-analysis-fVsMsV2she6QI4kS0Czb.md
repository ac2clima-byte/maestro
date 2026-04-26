# Analisi dev-request fVsMsV2she6QI4kS0Czb

**Origine:** segnalazione "bug_from_chat" dal bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_j9cqy7d8mog3b2ha
**Data:** 2026-04-26 18:28 UTC
**Nota di Alberto:** "la dettatura vocale non funziona"

> La conversazione catturata nel doc Firestore parla di interventi (era la chat
> aperta in quel momento). La nota è chiara e indipendente dalla conversazione:
> il problema è il bottone 🎤 / la dettatura vocale dentro NEXUS Chat.

## Diagnosi — cosa succede oggi

La dettatura vocale è implementata in `projects/nexo-pwa/public/js/app.js` con la Web Speech API (`SpeechRecognition`), classe `nexusVoice` + funzioni `nexusVoiceStart/Resume/Pause/Stop/Toggle`. Il flusso:

1. Al boot `nexusWire()` (riga 2524) chiama `mic.hidden = !nexusVoiceSupported()` (riga 2548): se l'API non c'è, **il bottone 🎤 viene nascosto**, **senza alcun feedback all'utente**.
2. Click sul bottone → `nexusToggleVoice()` (riga 2497) → `nexusVoiceStart()` (riga 2400) → se non supportato mostra `"Browser non supporta dettatura. Usa Chrome o Edge."` in `#nexusVoiceStatus`.
3. Se supportato avvia `new SpeechRecognition()` con `lang="it-IT"`, `continuous=true`, `interimResults=true`. Auto-send dopo 1500ms di silenzio (`NEXUS_VOICE_SILENCE_MS`).

Cause possibili per cui Alberto vede "non funziona":

### Causa probabile 1 — il bottone 🎤 è nascosto perché il browser non espone SpeechRecognition
`window.SpeechRecognition || window.webkitSpeechRecognition` è disponibile su Chrome/Edge desktop, Chrome Android. **NON disponibile** su:
- **Firefox** (tutte le versioni)
- **Safari iOS** in modo affidabile (a tratti, dipende dalla versione)
- **Safari macOS** prima della 14.1
- **WebView Android** in alcune configurazioni
- **PWA installate su iOS** (anche se Safari supporta, la versione standalone spesso no)

Se Alberto sta usando Safari su iPhone/iPad, o Firefox, il bottone è semplicemente assente. Lui guarda la chat, non vede il microfono e dice "non funziona". **Nessun messaggio gli spiega perché.**

### Causa probabile 2 — permesso microfono bloccato a livello browser/sistema
Anche se l'API esiste, `rec.start()` può fallire con `not-allowed` o `service-not-allowed`. L'handler `onerror` (riga 2441) mappa questi errori in messaggio "Permesso microfono negato." in `#nexusVoiceStatus`. Ma:
- Su iOS, anche con permesso concesso, la PWA in standalone può ricevere `service-not-allowed` perché Apple disabilita la SR al di fuori di Safari standard.
- Su Windows, se il microfono è bloccato a livello sistema (Privacy → Microphone OFF) o usato da un'altra app (Zoom, Teams), l'errore arriva.
- Il messaggio appare solo se `nexusVoiceStart()` è stato cliccato, e solo nel piccolo banner sopra l'input — facile da non notare.

### Causa probabile 3 — il bottone è visibile ma il prompt permessi non appare
La PWA NON chiama `navigator.mediaDevices.getUserMedia({audio:true})` PRIMA di `rec.start()`. La maggior parte dei browser ottiene il permesso microfono "implicitamente" via SpeechRecognition, ma alcuni richiedono un permesso esplicito media. Se il browser non mostra il prompt e non concede il permesso, la SR fallisce silenziosamente: `onstart` non parte, `onerror` non parte (o parte con `aborted`), e il bottone resta in stato "speaking/idle/listening" inconsistente.

### Causa probabile 4 — auto-restart loop su `no-speech`
Riga 2443:
```js
if (err === "no-speech" && nexusVoice.active && !nexusVoice.paused) {
  setTimeout(() => { nexusVoice.listening = false; nexusVoiceResume(); }, 300);
  return;
}
```
Se Alberto attiva il mic ma resta in silenzio, l'errore `no-speech` (timeout) parte dopo ~6-8s, il codice riavvia immediatamente. Su alcuni browser (Edge, Chrome recenti) un riavvio troppo rapido genera `aborted` e la SR si rompe. Lo stato `listening` può restare `true` ma `rec` è morto, oppure `false` ma con stato visibile "🟢 pronto" senza ascolto effettivo.

### Causa probabile 5 — `onend` riavvia in loop con `nexusVoiceResume`
Riga 2459:
```js
rec.onend = () => {
  nexusVoice.listening = false;
  if (nexusVoice.active && !nexusVoice.paused) {
    setTimeout(() => nexusVoiceResume(), 200);
  }
};
```
Su iOS Safari `onend` può scattare ogni 1-2s, il riavvio `nexusVoiceResume` crea ogni volta una nuova istanza `NEXUS_SR`, accumulando handler. Memoria che cresce, audio che si "frantuma".

### Causa probabile 6 — Manca pulsante mic globale e l'utente non sa dove cliccare
Il bottone è dentro `.nexus-input` accanto a 📎 e ➤ (riga 162 `index.html`). Su mobile in fullscreen o con tastiera aperta il bottone può essere nascosto dietro la tastiera o non visibile per il layout responsive.

### Causa probabile 7 — `nexusWire()` chiamato solo post-auth → mic visibile solo dopo login
`nexusWire()` è chiamato da `init()` post-`onAuthStateChanged`. **Se per qualche motivo `init()` non gira (è già il caso del bug del bottone 🐛 fixato di recente con `nexusBugWireWhenReady` su DOMContentLoaded)**, anche la riga `mic.hidden = !nexusVoiceSupported()` non viene mai eseguita → il bottone resta `hidden` come dichiarato in HTML. Stesso pattern di bug che ho già visto.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/nexo-pwa/public/js/app.js` | 2342 | `NEXUS_SR = window.SpeechRecognition \|\| window.webkitSpeechRecognition \|\| null` — definizione |
| `projects/nexo-pwa/public/js/app.js` | 2355 | `nexusVoiceSupported()` |
| `projects/nexo-pwa/public/js/app.js` | 2400-2411 | `nexusVoiceStart` (mostra messaggio non supportato solo se cliccato) |
| `projects/nexo-pwa/public/js/app.js` | 2413-2473 | `nexusVoiceResume` (start SR, gestisce result/error/end) |
| `projects/nexo-pwa/public/js/app.js` | 2441-2458 | `onerror` mapping (not-allowed/service-not-allowed/audio-capture/network) |
| `projects/nexo-pwa/public/js/app.js` | 2459-2465 | `onend` con auto-restart |
| `projects/nexo-pwa/public/js/app.js` | 2546-2550 | `nexusWire`: `mic.hidden = !nexusVoiceSupported()` chiamato solo qui |
| `projects/nexo-pwa/public/js/app.js` | 2497-2500 | `nexusToggleVoice` |
| `projects/nexo-pwa/public/index.html` | 162 | bottone `#nexusMicBtn` con `hidden` di default |
| `projects/nexo-pwa/public/index.html` | 157 | div `#nexusVoiceStatus` per feedback |
| `projects/nexo-pwa/public/css/main.css` | 1518-1591 | stile `.nexus-btn-icon` + `[hidden]{display:none!important}` + stati recording/speaking/idle |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Wiring del bottone mic indipendente da `init()` (S)
**Dove:** `app.js`, simile al pattern di `nexusBugWireWhenReady` già adottato.
Aggiungere `nexusMicWireWhenReady()` chiamato su `DOMContentLoaded`:
```js
function nexusMicWireWhenReady() {
  const wire = () => {
    const mic = document.getElementById("nexusMicBtn");
    if (!mic) return;
    if (mic._nexusMicWired) return;
    mic._nexusMicWired = true;
    if (nexusVoiceSupported()) {
      mic.hidden = false;
      mic.addEventListener("click", nexusToggleVoice);
    } else {
      // bottone visibile in stato "non supportato" → click mostra messaggio
      mic.hidden = false;
      mic.classList.add("nexus-btn-disabled");
      mic.title = "La dettatura non è supportata in questo browser. Usa Chrome o Edge.";
      mic.addEventListener("click", () => {
        nexusSetVoiceStatus("La dettatura non è supportata in questo browser. Usa Chrome o Edge su Windows o Android.", "error");
      });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();
}
nexusMicWireWhenReady();
```
**Perché:** elimina la classe di bug "wire dipendente da init()" già vista col bottone bug. Bottone sempre presente, click sempre risponde con un feedback chiaro.

### 2) Diagnostica accessibile (S)
**Dove:** `app.js`, dentro `nexusVoiceStart` o subito dopo.
Quando si clicca mic, eseguire una pre-flight check con `navigator.mediaDevices.getUserMedia({audio:true})`:
```js
async function nexusPreflightMic() {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "no-mediadevices", msg: "Il browser non supporta l'accesso al microfono. Usa Chrome o Edge." };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop()); // chiudi subito, ci serve solo il permesso
    return { ok: true };
  } catch (e) {
    const name = e.name || "";
    if (/NotAllowed/i.test(name)) return { ok: false, reason: "denied", msg: "Permesso microfono negato. Apri impostazioni browser e abilita il microfono per https://nexo-hub-15f2d.web.app." };
    if (/NotFound/i.test(name) || /Devices/i.test(name)) return { ok: false, reason: "no-device", msg: "Nessun microfono rilevato sul dispositivo." };
    return { ok: false, reason: "other", msg: "Errore microfono: " + (e.message || name) };
  }
}
```
Chiamarlo in `nexusVoiceStart` prima di `nexusVoiceResume`. Se fallisce, mostrare il messaggio in `#nexusVoiceStatus` ed evitare il loop di restart.

**Perché:** oggi se il permesso è negato o il dispositivo non ha microfono, l'errore arriva tardi (dopo `rec.start()`) o non arriva. La pre-flight dà feedback immediato e azionabile.

### 3) Banner persistente di stato/aiuto (S)
**Dove:** `app.js`, all'apertura del pannello NEXUS (`nexusOpen`), o all'init.
Se `!nexusVoiceSupported()` → mostra una volta sola un banner (toast tipo `nexo-toast`) "La dettatura vocale richiede Chrome o Edge. Sul tuo browser puoi usare comunque la chat scritta." con dismiss.

**Perché:** evita che Alberto perda tempo a cliccare un bottone che non c'è. Lo informa proattivamente.

### 4) Hardening del loop di restart (M)
**Dove:** `app.js:2459-2465` (`onend`) e `:2443-2447` (`no-speech`).
- Aggiungere counter `nexusVoice.restartCount` con cap (es. 5 in 30s). Se superato → stop e mostra messaggio "La dettatura ha avuto problemi. Tocca di nuovo il microfono per riprovare."
- `setTimeout` per restart aumentato progressivamente (200ms, 500ms, 1s, 2s) per evitare loop fitto.
- Su `aborted` non riavviare automaticamente (oggi salta il check).

**Perché:** elimina i casi di "audio frantumato" su iOS Safari e i loop quando la SR è in stato corrotto.

### 5) Bottone visivo "stato non supportato" (S)
**Dove:** `app.js` (vedi step 1) + `main.css`.
Aggiungere CSS `.nexus-btn-disabled { opacity: .45; cursor: help; }` per il bottone mic non funzionante.

### 6) Logging diagnostico (S, opzionale)
**Dove:** `app.js`, dentro `nexusVoiceStart` e gli handler.
Aggiungere `console.log("[nexus-voice] supported:", nexusVoiceSupported(), "userAgent:", navigator.userAgent)` al primo click. Aiuta nel prossimo bug report a capire subito browser/device.

### 7) (M, opzionale) Fallback server-side via `/nexusTranscribeAudio`
**Dove:** già esiste `nexusUploadAudio` che manda file audio al backend (riga ~2156). Estendere con registrazione live via `MediaRecorder` quando SR non è supportato, mandando blob 5s al backend per trascrizione (Whisper / Edge TTS reverse). Più affidabile cross-browser ma richiede infra.

**Perché:** dà dettatura vocale anche su Firefox/iOS Safari/Edge con SR rotta. Costo cloud function call per uso, ma Alberto fa pochi messaggi vocali.

### 8) Test PWA con Playwright (S)
- Test 1: aprire la PWA in headless Chromium (supporta SR) → verificare che mic appaia e il click `onstart` parta.
- Test 2: simulare assenza di `window.SpeechRecognition` (override) → verificare che bottone resti visibile con stato disabled e click mostri messaggio.
- Test 3: simulare `getUserMedia` rifiutato → verificare messaggio "Permesso negato".

## Rischi e alternative

### R1 — `getUserMedia` apre un prompt di permesso che chiude da solo lo stream
La pre-flight chiede il permesso, ottiene lo stream, lo ferma. Su Chrome/Edge il prompt resta concesso per la sessione. Su Safari potrebbe richiedere ogni volta. Mitigazione: cache del flag `_micPermissionGranted` in sessionStorage e skip della pre-flight se già concesso.

### R2 — Banner intrusivo
Mostrare un banner "non supportato" ad ogni apertura della chat può infastidire. Mitigazione: dismissibile con localStorage flag (`nexo.voice.dismissed`).

### R3 — Counter di restart troppo aggressivo
Se Alberto usa la voce per 10 minuti, normali `onend` e ripartenze sono frequenti. Cap a 5/30s rischia di spegnere prematuramente. Mitigazione: counter solo per `aborted` consecutivi (≥3), non per `onend` puliti.

### R4 — Differenze HTTPS / mixed content
La PWA è già HTTPS (`https://nexo-hub-15f2d.web.app`). Ma se Alberto la apre via IP locale o intranet (es. via WiFi aziendale con proxy SSL inspection), `getUserMedia` può fallire. Diagnostica console.log aiuta a vedere `location.protocol`.

### R5 — Whisper backend
Già esiste un endpoint `nexusTranscribeAudio` (su europe-west1). Costo per trascrizione: ~$0.006/min, trascurabile per uso individuale. Però richiede MediaRecorder + chunked upload, non banale.

### Alternative scartate

- **A1: rimuovere completamente la dettatura.** Drastico. Alberto la usa, va sistemata.
- **A2: forzare l'uso di Chrome.** Se Alberto è su iOS, impossibile.
- **A3: refactor completo con MediaRecorder + Whisper backend.** Sì come step 7, ma è M-L, non S/M. Da pianificare separatamente.

## Effort stimato

**Totale: M (medium)** — 2-3 ore per tutti i fix non backend; il fallback Whisper è M-L separato.

| Step | Effort |
|---|---|
| 1) wiring indipendente da init() | S — 20' |
| 2) pre-flight `getUserMedia` con messaggi azionabili | S — 30' |
| 3) banner one-shot di non-supporto | S — 20' |
| 4) hardening restart loop | M — 60' |
| 5) CSS stato disabled | S — 10' |
| 6) logging diagnostico | S — 10' |
| 7) fallback Whisper (opzionale) | M-L — 3-5h, separato |
| 8) test Playwright | S — 30' |
| Deploy + email + commit | S — 10' |

**Senza step 7**: ~3 ore. Risolve il 90% dei casi (Chrome/Edge desktop con permessi accidentalmente bloccati, browser non supportati con feedback chiaro, iOS Safari standalone con messaggio).

## Test di accettazione

1. **Browser non supportato (es. Firefox)**: bottone 🎤 visibile in stato "disabled", click mostra messaggio "La dettatura non è supportata in questo browser. Usa Chrome o Edge."
2. **Permesso negato**: pre-flight `getUserMedia` rifiutato → banner "Permesso microfono negato. Apri impostazioni..."
3. **Permesso concesso, Chrome desktop**: click → permesso concesso → stato "🔴 ti ascolto…", parlare 2-3 secondi → auto-send dopo 1.5s di silenzio.
4. **iOS Safari standalone**: bottone visibile, click chiama pre-flight, se SR non funziona mostra messaggio specifico.
5. **Loop restart**: lasciare il mic acceso 5min → no errori in console, no memory leak misurabile.
6. **Console diagnostica**: al primo click sul mic, vedo riga `[nexus-voice] supported: true userAgent: …`.
