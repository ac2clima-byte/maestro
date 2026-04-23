# Setup Tasker (Android) — Registrazione automatica chiamate → NEXO

Questa guida spiega come configurare il telefono Android di Alberto per:
1. **Registrare automaticamente** le chiamate in uscita/entrata.
2. A fine chiamata, mostrare una notifica "Manda la registrazione a NEXO?".
3. Se tocchi la notifica → si apre la PWA NEXO con la registrazione già condivisa,
   che viene inviata a Whisper per la trascrizione e a Haiku per l'analisi
   intent (chi ha chiamato, cosa vuole, azioni suggerite).

## Prerequisiti

- Android 10+ (la registrazione chiamate nativa è limitata; serve app esterna).
- App **Tasker** (a pagamento, 3.49€ una tantum) oppure **Automate** (gratis con limiti).
- Un registratore di chiamate che salva i file in una cartella nota (es.
  `/storage/emulated/0/Recordings/Call` o similare).
- La PWA NEXO già installata come PWA dal menu Chrome → "Aggiungi a schermata Home".
- PWA loggata con credenziali ACG.

## Opzione A — Tasker

### Passo 1: App registratore chiamate
Installa una delle seguenti app (tutte Android 11+ compatibili):
- **Cube ACR** (consigliato, gratis con opzione Pro)
- **Automatic Call Recorder** (Google Play)
- **Boldbeast Call Recorder**

Configurala per salvare i file audio in una cartella dedicata (es. `Recordings/Call/`)
in formato `.m4a` o `.mp3`.

### Passo 2: Profilo Tasker "Fine chiamata"

Apri Tasker → **+** (nuovo profilo):

1. **Evento** → **Telefono** → **Fine chiamata**
2. Lascia i parametri a default (qualsiasi numero).

Tasker ti chiederà un Task da collegare. Creane uno nuovo, nome "Manda a NEXO".

### Passo 3: Task "Manda a NEXO"

Aggiungi i seguenti step:

1. **Attesa** → 5 secondi (lascia tempo al registratore di chiudere il file)
2. **File** → **Elenca file** → Directory: `/storage/emulated/0/Recordings/Call`
   → Variabile → `%files`  (parametri: `Sort` = `Modified Date (Descending)`)
3. **Variabili** → **Imposta variabile** → Name: `%last_recording` →
   To: `%files(1)` (il file più recente)
4. **Avviso** → **Notifica con lista** →
   Titolo: `Manda a NEXO?`
   Testo: `Chiamata: %last_recording`
   Pulsanti: `Sì` / `No`
   Action on `Sì`: passa al prossimo step
   Action on `No`: **Stop** (termina)
5. **App** → **Apri URL**:
   `https://nexo-hub-15f2d.web.app/share?audio=%last_recording`

   *(Opzionalmente)* Usa invece l'Intent nativo Android di condivisione:
   **App** → **Invia Intent** →
   Action: `android.intent.action.SEND`
   Mime Type: `audio/*`
   Extra: `EXTRA_STREAM: file://%last_recording`
   Package: `com.android.chrome`
   Target: `Activity`

   Quando Chrome riceve l'intent e la PWA NEXO è installata come Share Target
   (via `manifest.json`), Android offrirà l'opzione "NEXO" nel selettore di
   condivisione.

6. Salva il Task e chiudi Tasker.

### Passo 4: Verifica

Fai una chiamata di prova (anche a te stesso). A fine chiamata:
- Dovresti vedere la notifica Tasker "Manda a NEXO?".
- Tocca **Sì** → si apre la PWA NEXO.
- La chat NEXUS mostra "📞 Audio ricevuto: Call_20260424_093012.m4a"
- Dopo pochi secondi: trascrizione + analisi Haiku (chi ha chiamato,
  cosa vuole, azioni suggerite).

## Opzione B — Automate (gratis)

**Automate** è l'alternativa gratuita di Tasker. Flow:

1. Nuovo Flow → trigger `Call incoming ended`
2. Blocco `File contents latest modified` → cartella `Recordings/Call`
3. Blocco `Content sharing send` → Mime type `audio/*`, target package
   `com.android.chrome`
4. Salva e abilita il Flow.

Limiti: max 30 blocchi per flow nella versione gratuita (ci stiamo).

## Troubleshooting

### "Non vedo NEXO nel selettore di condivisione Android"
La PWA deve essere **installata** (non solo visitata). Apri Chrome, vai su
`nexo-hub-15f2d.web.app`, menu ⋮ → "Aggiungi a schermata Home". Poi apri
Android Settings → App → NEXO → "Gestione di app predefinite" → controlla
che compaia nella lista "Share Target".

### "Il file audio non viene trovato"
Molti registratori salvano in cartelle diverse:
- Cube ACR: `Recordings/CallRecorder`
- Android nativo: `Recordings/Call`
- Automatic Call Recorder: `CallRecordings`

Aggiorna lo step 2 di Tasker con la cartella giusta. Per trovarla:
apri un file manager (es. Files by Google), cerca una registrazione recente,
vedi il percorso completo.

### "La PWA non riceve il file"
Verifica:
1. Il manifest.json della PWA ha `share_target.action = "/share"` ✓
2. Il Service Worker è registrato (apri DevTools → Application → Service Workers,
   deve esserci `sw.js` attivo).
3. Prova prima con un file testuale: condividi da Gmail → deve apparire NEXO.

### "Whisper ritorna 503"
La trascrizione richiede `OPENAI_API_KEY` configurata come secret della
Cloud Function `nexusTranscribeAudio`. Configura con:

```bash
firebase functions:secrets:set OPENAI_API_KEY --project nexo-hub-15f2d
# incolla la key
firebase deploy --only functions:nexusTranscribeAudio --project nexo-hub-15f2d
```

Finché non è configurata, l'endpoint risponde **503** con un messaggio che
invita a configurare la chiave. Questo è stato fatto intenzionalmente per
non silenziare errori opachi.

**Alternativa locale**: HERMES (il voice assistant ACG su `/mnt/c/HERMES/`)
usa `faster-whisper` locale via TCP (porta 9876). Per riusarlo servirebbe
esporre l'endpoint HTTP da HERMES o copiare `whisper_server.py` su un server
pubblico (Hetzner). Fuori scope questa sessione.

## Privacy

- La registrazione della chiamata viene caricata SOLO se tocchi "Sì" sulla
  notifica Tasker. Non c'è upload automatico.
- Il file viene cancellato da Firestore dopo **30 giorni** (TTL su
  `nexus_audio_transcripts`).
- Per chiamate sensibili, NON registrare o usa un'app che cripta local-first.
- Verifica sempre il consenso della controparte alla registrazione (GDPR,
  Codice Privacy italiano).

## Automazione avanzata (v0.2 roadmap)

- Invio automatico senza conferma manuale per numeri noti (clienti whitelisted
  in COSMINA `crm_clienti`).
- Auto-skip per chiamate < 30s (probabilmente saluti/squilli a vuoto).
- Trigger push ad Alberto su desktop se la trascrizione segnala
  `intent = aprire_intervento_urgente` (oltre la notifica mobile).
