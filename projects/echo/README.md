# ECHO — Collega Comunicazione

**Stato:** Da costruire (Tier 2 nel piano NEXO).

**Dominio:** comunicazione in uscita su tutti i canali — WhatsApp, Telegram,
email, notifiche push PWA, voce (TTS/STT). Non decide *cosa* comunicare:
riceve istruzioni dagli altri Colleghi via Lavagna ed esegue il delivery.

## Cosa fa (azioni esposte)

- `sendMessage(channel, to, body, opts?)` — dispatcher generico
- `sendWhatsApp(to, body, opts?)` — via Waha (già operativo per COSMINA Inbox)
- `sendTelegram(chatId, body, opts?)` — via Telegram Bot API
- `sendEmail(to, subject, body, opts?)` — via Exchange/SMTP (EWS)
- `sendPushNotification(uid, title, body, opts?)` — push sulla PWA Firebase
- `speak(text, opts?)` — TTS via edge-tts (riusa il binario di HERMES)
- `transcribe(audioRef, opts?)` — STT via faster-whisper (riusa HERMES)
- `generaDigest(scope, opts?)` — costruisce un digest per Alberto e lo
  consegna sul canale configurato in `EchoPreferences`
- `onWhatsAppIncoming(payload)` — webhook handler (Waha)
- `onTelegramIncoming(payload)` — webhook handler (Telegram)

## Riceve dalla Lavagna

Tipi di messaggio ascoltati (campo `type`):

- `notifica` — qualsiasi → ECHO
- `alert` — PHARO → ECHO
- `digest_pronto` — IRIS → ECHO (digest mattutino)
- `bozza_approvata` — CALLIOPE → ECHO (bozza pronta da inviare)
- `agenda_giornaliera` — CHRONOS → ECHO (briefing del mattino)
- `escalation` — Orchestratore → ECHO

## Non fa

- Non classifica email (lo fa **IRIS**).
- Non decide cosa comunicare (lo decidono i Colleghi che mandano la
  richiesta sulla Lavagna).
- Non scrive bozze lunghe (lo fa **CALLIOPE**).
- In v0.1 non manda nulla senza approvazione di Alberto (eccezione: alert
  `priority: critical` → vanno subito).

## Collections Firestore

- `echo_messages` — log di tutti i messaggi inviati (channel, to, body,
  status, error?, attemptedAt, sentAt, priority, sourceLavagnaId?)
- `echo_channels` — configurazione runtime di ciascun canale (token, url,
  health check, rate limits)
- `echo_preferences` — preferenze di Alberto (canale preferito per tipo
  di notifica, quiet hours, digest schedule)

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore + auth tecnico
- Waha (HTTP API self-hosted, vedi `WAHA_API_URL`)
- Telegram Bot API (webhook + sendMessage)
- Exchange via EWS (riusa pattern di IRIS)
- edge-tts e faster-whisper come binari esterni (riusati da HERMES)

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `WAHA_API_URL` — endpoint Waha self-hosted
- `TELEGRAM_BOT_TOKEN`
- `EWS_URL` — Exchange Web Services per email in uscita
- `DRY_RUN=false` — se `true`, ogni invio viene loggato ma non eseguito
  realmente (utile in dev e nei test)

## Sviluppo

```bash
npm install
npm run dev        # tsx watch su src/index.ts
npm test           # vitest
npm run build      # tsc → dist/
```

## TODO v0.1

- [ ] Implementare `sendWhatsApp` via Waha (riadattare wrapper HERMES)
- [ ] Implementare `sendEmail` via EWS (pattern IRIS)
- [ ] Implementare listener Lavagna in `src/listeners/index.ts`
- [ ] Webhook receiver per WA + Telegram (creazione `lavagna` inbound)
- [ ] Persistenza `echo_messages` con dedup su `sourceLavagnaId`
