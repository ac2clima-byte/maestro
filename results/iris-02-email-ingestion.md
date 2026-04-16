# Risultato: iris-02-email-ingestion
> Eseguito: 2026-04-16T18:26:36.143Z
> Completato: sì

## Output

```
modulo di ingestion email. Crea uno script Python che IRIS (Node.js) chiamerà come subprocess.

  TASK:
  Lavora dentro projects/iris/. Crea:

  1. projects/iris/src/email-ingestion/ews_poller.py — Script Python che:
     - Si connette al server EWS usando exchangelib con NTLM
     - Accetta variabili d'ambiente: EWS_URL, EWS_USERNAME, EWS_PASSWORD, EWS_DOMAIN
     - Disabilita verifica TLS (per ora)
     - Fa una singola query: prende le email non lette degli ultimi 30 secondi dalla Inbox
     - Per ogni email trovata, stampa su stdout un JSON con: message_id, subject, sender, received_time, body_text (primi 2000 caratteri), has_attachments, importance
     - Ogni email è un JSON su una riga (JSON Lines format)
     - Se non ci sono email nuove, non stampa nulla
     - Esce con codice 0

  2. projects/iris/src/email-ingestion/EmailIngestion.ts — Classe TypeScript che:
     - Ha un metodo async poll(): Promise<Email[]>
     - Lancia ews_poller.py come subprocess (child_process.spawn con python3)
     - Parsa l'output JSON Lines
     - Ritorna array di oggetti Email tipizzati

  3. projects/iris/src/types/email.ts — Interfaccia Email con i campi del punto 1

  4. projects/iris/tests/email-ingestion.test.ts — Test con mock del subprocess Python:
     - Test: parsing corretto di una email
     - Test: parsing di email multiple (JSON Lines)
     - Test: nessuna email (output vuoto)
     - Test: errore subprocess (exit code != 0)

  5. Committa con "feat(iris): email ingestion module via EWS/exchangelib"

  NON testare la connessione al server EWS reale — solo mock nei test.

  ⎿  UserPromptSubmit says: Hookify import error: No module named 'hookify'

● Procedo con l'implementazione del modulo email ingestion.

● Write(projects/iris/src/email-ingestion/ews_poller.py)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 99 lines to projects/iris/src/email-ingestion/ews_poller.py
       1 #!/usr/bin/env python3
       2 """
       3 EWS poller for IRIS email ingestion.
       4
       5 Connects to an on-premise Exchange server via EWS with NTLM authentication,
       6 fetches unread emails received in the last POLL_INTERVAL_MS window from the
       7 Inbox, and emits each message as a JSON Lines record on stdout.
       8
       9 Env vars:
      10     EWS_URL, EWS_USERNAME, EWS_PASSWORD, EWS_DOMAIN, POLL_INTERVAL_MS
     … +89 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Bash(chmod +x /home/albertocontardi/maestro-bridge/projects/iris/src/email-ingestion/ews_poller.py)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  Done
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Write(projects/iris/src/types/email.ts)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 11 lines to projects/iris/src/types/email.ts
       1 export type EmailImportance = "Low" | "Normal" | "High" | string;
       2
       3 export interface Email {
       4   message_id: string;
       5   subject: string;
       6   sender: string;
       7   received_time: string | null;
       8   body_text: string;
       9   has_attachments: boolean;
      10   importance: EmailImportance;
     … +1 line (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Ora la classe EmailIngestion. La faccio DI-friendly (spawner iniettabile) così i test possono mockare senza toccare child_process.

● Write(projects/iris/src/email-ingestion/EmailIngestion.ts)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 98 lines to projects/iris/src/email-ingestion/EmailIngestion.ts
       1 import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
       2 import { fileURLToPath } from "node:url";
       3 import { dirname, resolve } from "node:path";
       4
       5 import type { Email } from "../types/email.js";
       6
       7 export interface SpawnResult {
       8   stdout: string;
       9   stderr: string;
      10   code: number | null;
     … +88 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Ora i test vitest con spawner mockato.

● Write(projects/iris/tests/email-ingestion.test.ts)
  ⎿  PreToolUse:Write says: Hookify import error: No module named 'hookify'
  ⎿  Wrote 110 lines to projects/iris/tests/email-ingestion.test.ts
       1 import { describe, it, expect } from "vitest";
       2
       3 import {
       4   EmailIngestion,
       5   type Spawner,
       6   type SpawnResult,
       7 } from "../src/email-ingestion/EmailIngestion.js";
       8 import type { Email } from "../src/types/email.js";
       9
      10 function fakeSpawner(result: SpawnResult): Spawner {
     … +100 lines (ctrl+o to expand)
  ⎿  PostToolUse:Write says: Hookify import error: No module named 'hookify'

● Rimuovo i .gitkeep dalle cartelle che ora contengono file reali, poi committo.

● Bash(cd /home/albertocontardi/maestro-bridge/projects/iris && rm -f src/email-ingestion/.gitkeep src/types/.gitkeep tests/.gitkeep && ls src/email-ingestion/ src/typ…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  src/email-ingestion/:
     EmailIngestion.ts
     ews_poller.py
     … +6 lines (ctrl+o to expand)
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Bash(cd /home/albertocontardi/maestro-bridge && git add -A projects/iris/ && git status --short && git commit -m "$(cat <<'EOF'
      feat(iris): email ingestion module vi…)
  ⎿  PreToolUse:Bash says: Hookify import error: No module named 'hookify'
  ⎿  D  projects/iris/src/email-ingestion/.gitkeep
     A  projects/iris/src/email-ingestion/EmailIngestion.ts
     A  projects/iris/src/email-ingestion/ews_poller.py
     … +13 lines (ctrl+o to expand)
  ⎿  Allowed by auto mode classifier
  ⎿  PostToolUse:Bash says: Hookify import error: No module named 'hookify'

● Commit 6d5590a. Modulo email ingestion pronto:

  - ews_poller.py — exchangelib + NTLM, TLS off (con TODO per pinning), filter is_read=False + datetime_received > now - POLL_INTERVAL_MS, output JSON Lines con i 7 campi richiesti, exit
  code 2 su env mancanti
  - EmailIngestion.ts — classe con poll(), spawner iniettabile (default: python3 via child_process.spawn), risolve ews_poller.py relativo al modulo compilato
  - types/email.ts — interfaccia Email
  - 6 test vitest — single/multiple/empty/whitespace/exit-code-2/exit-code-1, tutti con spawner fake (nessuna connessione reale)
  ⎿  Stop says: Hookify import error: No module named 'hookify'

✻ Baked for 1m 12s

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  ⚡SuperCycle | Opus 4.7 (1M context) | ctx:6% | $1.59
  ⚪ monitor: stale (5730min fa)
  ⏵⏵ auto mode on (shift+tab to cycle)
```