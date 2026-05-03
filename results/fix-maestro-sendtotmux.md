# Risultato: fix-maestro-sendtotmux
> Eseguito: 2026-05-03T08:58:10.874Z
> Completato: sì

## Modifiche

- **`maestro.mjs:2`**: aggiunto `unlinkSync` agli import da `fs`
- **`maestro.mjs:443-471`**: refactor `sendToTmux` con dual-path:
  - `text.length < 8000`: path classico `send-keys -l 'escaped'` (più veloce, ~0 overhead)
  - `text.length >= 8000`: scrive in `/tmp/nexo-maestro-prompt-{ts}-{pid}.txt`, usa `tmux load-buffer -b nexo-prompt <file>` + `tmux paste-buffer -b nexo-prompt -t SESSION` + `delete-buffer` + `send-keys C-m`. File temp eliminato in `finally`.

Il limite ~8KB è scelto conservativo: con escape `'\''` il quoting può raddoppiare/triplicare i bytes, e `ARG_MAX` (~128KB) lascia ~40KB effettivi prima del fail. 8KB lascia ampio margine sotto il limite reale.

## Test

Test live non eseguibile da Claude Code (richiederebbe restart MAESTRO che gira su WSL Alberto, fuori dal mio scope autonomo). Verifica:
- **Sintassi**: `node --check maestro.mjs` → OK ✅
- **Logic walkthrough**: small path invariato (<8KB → stesso codice di prima); large path scrive file, carica buffer, incolla, pulisce.

Per validazione end-to-end serve:
1. Restart MAESTRO sul WSL: `nohup node maestro.mjs > /tmp/maestro.log 2>&1 &`
2. Riproporre `setup-nexo-forge.md` (23.6KB) → osservare in `/tmp/maestro.log` che NON appare "command too long"
3. Verificare che il pane tmux di `claude-code-session` riceva il prompt completo

## Sicurezza

- File temp scritti in `/tmp/nexo-maestro-prompt-*.txt` (default mode, leggibile solo all'utente che li scrive sul Linux user-private). Eliminati subito dopo paste.
- Buffer tmux nominato `nexo-prompt`, eliminato dopo paste — non resta in memoria sessione.
- Niente retry automatici: se `load-buffer` fallisce (es. /tmp pieno), errore propaga e MAESTRO marca il task come failed (no loop infinito).

## File modificato

- `maestro.mjs` (project root)

## Commit message

`fix(maestro): sendToTmux usa load-buffer per task >8KB (risolve command-too-long)`
