# Risultato: iris-fix-visibilita
> Eseguito: 2026-04-16T19:06:59.195Z
> Completato: sì

## Output

```
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

❯ IMPORTANTE — Fai queste cose ORA:

  1. Crea (o aggiorna) il file CLAUDE.md nella root del repo ~/maestro-bridge con queste regole:

  # Regole MAESTRO

  ## Visibilità output
  - Ogni volta che crei un file HTML, APRILO nel browser: cmd.exe /c start <percorso-file>
  - Ogni volta che crei un'immagine/screenshot, APRILA: cmd.exe /c start <percorso-file>
  - Ogni volta che fai un test con risultati, mostra i risultati in una PAGINA HTML e aprila nel browser
  - MAI salvare risultati solo su disco senza mostrarli visivamente ad Alberto

  ## Regole generali
  - Lingua: italiano
  - Committa sempre dopo aver completato un task
  - Non chiedere conferme, sei in auto mode

  2. Poi APRI nel browser tutti i file che hai creato nelle ultime sessioni e che non hai aperto:
     - projects/iris/pwa/index.html (la dashboard IRIS)
     - projects/iris/test-ews-output.md (o qualsiasi risultato del test EWS)
     - projects/iris/pwa/screenshots/02-dashboard.png (screenshot dashboard)

  Usa cmd.exe /c start per ogni file.

  ⎿  UserPromptSubmit says: Hookify import error: No module named 'hookify'

● Procedo: creo/aggiorno CLAUDE.md, apro i 3 file nel browser Windows, committo.

  Listed 1 directory (ctrl+o to expand)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Non esiste. Lo creo ex novo (nel progetto, distinto dal CLAUDE.md home di Alberto).

● Write(CLAUDE.md)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 12 lines to CLAUDE.md
       1 # Regole MAESTRO
       2
       3 ## Visibilità output
       4 - Ogni volta che crei un file HTML, APRILO nel browser: cmd.exe /c start <percorso-file>
       5 - Ogni volta che crei un'immagine/screenshot, APRILA: cmd.exe /c start <percorso-file>
       6 - Ogni volta che fai un test con risultati, mostra i risultati in una PAGINA HTML e aprila nel browser
       7 - MAI salvare risultati solo su disco senza mostrarli visivamente ad Alberto
       8
       9 ## Regole generali
      10 - Lingua: italiano
     … +2 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Ora apro i 3 file nel browser Windows. Uso il pattern testato: copia su /mnt/c/Users/Public/ → cmd.exe /c start da C:\.

● Bash(mkdir -p /mnt/c/Users/Public/iris-view && cp /home/albertocontardi/maestro-bridge/projects/iris/pwa/index.html /mnt/c/Users/Public/iris-view/iris-dashboard.html…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  total 356
     drwxrwxrwx 1 albertocontardi albertocontardi   4096 Apr 16 21:05 .
     drwxrwxrwx 1 albertocontardi albertocontardi   4096 Apr 16 21:05 ..
     … +3 lines (ctrl+o to expand)
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Bash(cd /mnt/c && cmd.exe /c start "" "C:\Users\Public\iris-view\iris-dashboard.html" && cmd.exe /c start "" "C:\Users\Public\iris-view\test-ews-output.md" && cmd.ex…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  all opened
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Tutti e 3 aperti. La dashboard IRIS ha bisogno del flag ?mock=1 per mostrare i dati senza login — la apro di nuovo con quell'URL.

● Bash(cd /mnt/c && cmd.exe /c start "" "C:\Users\Public\iris-view\iris-dashboard.html?mock=1"; echo "mock view opened")
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  Impossibile trovare il file C:\Users\Public\iris-view\iris-dashboard.html?mock=1.
     mock view opened
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● start tratta la query string come parte del path. Uso explorer.exe col protocollo file:/// (che start gira a un browser default).

● Bash(cd /mnt/c && cmd.exe /c start "" "file:///C:/Users/Public/iris-view/iris-dashboard.html?mock=1"; echo "mock opened via file://")
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  mock opened via file://
  ⎿  Shell cwd was reset to /home/albertocontardi/maestro-bridge
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Commit del CLAUDE.md.

● Bash(git add CLAUDE.md && git commit -m "$(cat <<'EOF'
      docs: aggiungi CLAUDE.md con regole MAESTRO…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  [main 3f81259] docs: aggiungi CLAUDE.md con regole MAESTRO
      1 file changed, 12 insertions(+)
      create mode 100644 CLAUDE.md
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Fatto:

  1. CLAUDE.md creato con le regole MAESTRO (visibilità output + generali), commit 3f81259
  2. 3 file aperti nel browser Windows via cmd.exe /c start:
    - iris-dashboard.html → aperto (due volte: prima la login vuota, poi con ?mock=1 via file:// per vedere la dashboard popolata con le 10 email mock)
    - test-ews-output.md → aperto (mostra le 5 email EWS reali)
    - 02-dashboard.png → aperto nel viewer immagini Windows

  Nota tecnica: cmd.exe /c start <file>.html?mock=1 non accetta la query string (tratta ? come path letterale). Soluzione: passare file:///C:/.../...html?mock=1 come URL, che start
  instrada al browser default.
  ⎿  Stop says: Hookify import error: No module named 'hookify'

✻ Sautéed for 1m 48s

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚡SuperCycle | Opus 4.7 (1M context) | ctx:16% | $8.99
  ⚪ monitor: stale (5770min fa)
  ⏵⏵ auto mode on (shift+tab to cycle)
```