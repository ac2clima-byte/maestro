# Fix MAESTRO short-prompt per task grandi — applicato

## Modifiche

- **`maestro.mjs:2`**: rimosso `unlinkSync` dagli import (non più usato)
- **`maestro.mjs:443-451`**: `sendToTmux` torna alla versione originale semplice (`send-keys -l` + `sleep 1` + `C-m`). Rimosso il path `load-buffer/paste-buffer`: non funzionava con Code TUI (il `C-m` post-paste non svegliava l'esecuzione).
- **`maestro.mjs:603-624`**: `processTask` ora costruisce `promptText` con tre branch:
  - **dev-request**: invariato, usa sempre `buildDevRequestPrompt`
  - **task < 8KB**: invariato, incolla `originalContent` direttamente
  - **task >= 8KB**: prompt corto multi-riga `Esegui il task definito in tasks/<id>.md. Leggilo con il tuo tool Read...`. Code legge il file dal disco con il proprio tool, niente paste-buffer.

## Result stub falso rimosso

`results/setup-nexo-forge.md` (84 byte, segnava "Completato: sì" senza esecuzione vera) cancellato. Al prossimo polling MAESTRO, dopo il restart, troverà `tasks/setup-nexo-forge.md` come pending e lo rieseguirà col prompt corto.

## Test

- **Sintassi**: `node --check maestro.mjs` → OK ✅
- **Logic walkthrough**:
  - Path piccolo (<8KB): codice path identico a prima
  - Path grande (>=8KB): `originalContent` non viene mai mandato, il prompt è ~250 char, send-keys -l senza problemi di ARG_MAX
  - Path dev-request: invariato

Test live richiede:
1. Restart MAESTRO sul WSL: `pkill -f maestro.mjs; cd /home/albertocontardi/maestro-bridge && nohup node maestro.mjs > /tmp/maestro.log 2>&1 &`
2. Verifica nel pane tmux che Code riceva il prompt corto e poi chiami `Read tasks/setup-nexo-forge.md` invece di vedere il task incollato

## Cose lasciate fuori

- `unlinkSync` rimosso — niente più file temp `/tmp/nexo-maestro-prompt-*`
- Niente fallback retry: se `send-keys -l` fallisce sul prompt corto (~250 char) è un bug strutturale, MAESTRO marca task come failed e si fa diagnosticare

## Commit

`fix(maestro): per task >8KB manda prompt corto "leggi file" invece di paste-buffer`
