# Risultato: iris-todo
> Eseguito: 2026-04-16T19:01:47.502Z
> Completato: sì

## Output

```
● Test EWS reale riuscito: 5 email lette, nessuna modifica. Apro il report in Windows e committo.

● Bash(cp /home/albertocontardi/maestro-bridge/projects/iris/test-ews-output.md /mnt/c/Users/Public/test-ews-output.md && cd /mnt/c && cmd.exe /c start "" "C:\Users\Pu…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  opened exit: 0
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Bash(git status --short && echo "---" && git add projects/iris/scripts/test_ews_connection.py projects/iris/test-ews-output.md && git status --short && git commit -m…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  ?? projects/iris/scripts/test_ews_connection.py
     ?? projects/iris/test-ews-output.md
     ---
     … +6 lines (ctrl+o to expand)
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Commit afe5981. Test connessione EWS reale completato:

  Esito: ✅ 5 email lette read-only dalla Inbox di alberto.contardi@acgclimaservice.com

  ┌─────┬──────────────────────────────┬────────────────────────────────────────────┐
  │  #  │           Mittente           │                  Oggetto                   │
  ├─────┼──────────────────────────────┼────────────────────────────────────────────┤
  │ 1   │ root (MPVoIP)                │ Reperibilità chiamata in ingresso          │
  ├─────┼──────────────────────────────┼────────────────────────────────────────────┤
  │ 2   │ Francesca V. (Guazzotti)     │ Condomini fatturazione Manutenzione        │
  ├─────┼──────────────────────────────┼────────────────────────────────────────────┤
  │ 3   │ Roberto Moraschi (Cambielli) │ R: Complesso immobiliare (offerta)         │
  ├─────┼──────────────────────────────┼────────────────────────────────────────────┤
  │ 4   │ Assistenza tecnica Guazzotti │ Richiesta intervento Ticket 895/2026       │
  ├─────┼──────────────────────────────┼────────────────────────────────────────────┤
  │ 5   │ Roberto Moraschi (Cambielli) │ R: Complesso immobiliare ("Ma filettato?") │
  └─────┴──────────────────────────────┴────────────────────────────────────────────┘

  - Script: projects/iris/scripts/test_ews_connection.py (NTLM + NoVerifyHTTPAdapter, query .all().order_by('-datetime_received')[:5] read-only, stampa a console + scrive Markdown)
  - Output: projects/iris/test-ews-output.md — aperto nel viewer Windows
  - Risultati stampati a console (regole MAESTRO ✅) e report aperto in viewer Windows (regole MAESTRO ✅)
  - Nessuna email modificata, marcata come letta, cancellata o ricevuta risposta
  ⎿  Stop says: Hookify import error: No module named 'hookify'

✻ Cogitated for 2m 8s

❯ Crea un file projects/iris/TODO.md con la roadmap di IRIS v0.1. Ecco il contenuto:

  # IRIS — TODO v0.1

  ## Completato
  - [x] Setup progetto (package.json, tsconfig, struttura cartelle)
  - [x] Modulo email ingestion (EWS via exchangelib + wrapper TypeScript)
  - [x] Classificatore email (Claude Haiku + prompt contestualizzato ACG Clima)
  - [x] Schema Firestore (IrisEmailDoc, IrisCorrectionDoc)
  - [x] API routes (GET emails, GET email/:id, POST correct, GET stats)
  - [x] PWA dashboard con dati mock (login, lista email, filtri, modale correzione)
  - [x] Test connessione EWS reale a remote.gruppobadano.it

  ## Da fare — Integrazione
  - [ ] Configurare Firebase project nexo-hub-15f2d (web app registration)
  - [ ] Inserire Firebase config reale nella PWA (firebase-config.js)
  - [ ] Creare utente Alberto in Firebase Auth
  - [ ] Collegare PWA a Firestore reale (sostituire dati mock)
  - [ ] Collegare API routes a Firestore reale (sostituire stub)
  - [ ] Deploy Cloud Functions su nexo-hub-15f2d (us-central1)
  - [ ] Deploy PWA su Firebase Hosting (nexo-hub-15f2d.web.app)

  ## Da fare — Pipeline email
  - [ ] Cloud Function iris-ingestor: polling EWS ogni 30s, salva email grezze in Firestore
  - [ ] Cloud Function iris-classifier: trigger su nuova email, classifica con Haiku, salva risultato
  - [ ] Cloud Scheduler per attivare iris-ingestor ogni 30s
  - [ ] Gestione watermark EWS (non riprocessare email già viste)
  - [ ] Gestione errori e retry su fallimento EWS o API Haiku

  ## Da fare — Feedback loop
  - [ ] Endpoint POST /api/emails/:id/correct collegato a Firestore
  - [ ] Collection iris_corrections in Firestore
  - [ ] Arricchimento prompt classificatore con esempi dalle correzioni (few-shot)
  - [ ] Dashboard: conteggio correzioni per categoria, trend accuratezza

  ## Da fare — Sicurezza e produzione
  - [ ] Security rules Firestore (ogni utente vede solo le sue email)
  - [ ] Certificate pinning per EWS (no rejectUnauthorized:false)
  - [ ] API key Anthropic dedicata per IRIS in Secret Manager
  - [ ] Credenziali EWS in Secret Manager (non in .env)
  - [ ] Budget alert API Anthropic (50 EUR/mese)
  - [ ] GDPR: valutare DPIA per indicizzazione email aziendali

  ## Da fare — v0.2 (dopo 2 settimane di uso v0.1)
  - [ ] Notifiche Web Push per email urgenti
  - [ ] Integrazione HERMES: notifica vocale su email importanti
  - [ ] Notifiche Telegram per quando sei fuori ufficio
  - [ ] Multi-casella (info@acgclimaservice.com oltre alla personale)
  - [ ] Arricchimento da COSMINA (chi è il cliente, storico interventi)
  - [ ] Azioni automatiche suggerite (bozza risposta, apri intervento)

  Non aggiungere altro. Committa con "docs(iris): roadmap TODO v0.1"

  ⎿  UserPromptSubmit says: Hookify import error: No module named 'hookify'

● Creo il file, lo apro nel viewer Windows, committo.

  Listed 1 directory (ctrl+o to expand)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'

● Write(projects/iris/TODO.md)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 48 lines to projects/iris/TODO.md
       1 # IRIS — TODO v0.1
       2
       3 ## Completato
       4 - [x] Setup progetto (package.json, tsconfig, struttura cartelle)
       5 - [x] Modulo email ingestion (EWS via exchangelib + wrapper TypeScript)
       6 - [x] Classificatore email (Claude Haiku + prompt contestualizzato ACG Clima)
       7 - [x] Schema Firestore (IrisEmailDoc, IrisCorrectionDoc)
       8 - [x] API routes (GET emails, GET email/:id, POST correct, GET stats)
       9 - [x] PWA dashboard con dati mock (login, lista email, filtri, modale correzione)
      10 - [x] Test connessione EWS reale a remote.gruppobadano.it
     … +38 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Bash(cp /home/albertocontardi/maestro-bridge/projects/iris/TODO.md /mnt/c/Users/Public/IRIS-TODO.md && cd /mnt/c && cmd.exe /c start "" "C:\Users\Public\IRIS-TODO.md…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  opened: 0
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Bash(git add projects/iris/TODO.md && git commit -m "$(cat <<'EOF'
      docs(iris): roadmap TODO v0.1…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  [main 9ad9b6a] docs(iris): roadmap TODO v0.1
      1 file changed, 48 insertions(+)
      create mode 100644 projects/iris/TODO.md
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Commit 9ad9b6a. projects/iris/TODO.md creato con la roadmap v0.1 (7 completati, 24 da fare suddivisi in Integrazione / Pipeline / Feedback / Sicurezza / v0.2), aperto nel viewer Windows.
  ⎿  Stop says: Hookify import error: No module named 'hookify'

✻ Cogitated for 53s

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚡SuperCycle | Opus 4.7 (1M context) | ctx:15% | $8.30
  ⚪ monitor: stale (5765min fa)
  ⏵⏵ auto mode on (shift+tab to cycle)
```