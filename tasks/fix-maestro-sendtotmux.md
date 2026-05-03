# Fix MAESTRO sendToTmux: "command too long" su task grandi

## Bug

Quando un task in `tasks/*.md` supera ~20KB, `sendToTmux()` in `maestro.mjs`
fallisce con `command too long`. Errore osservato il 03/05/2026 sul task
`setup-nexo-forge.md` (23.6KB):

```
sendToTmux (maestro.mjs:446) → execSync (`tmux send-keys -t SESSION -l '<23KB>'`)
→ command too long → exit 1
```

Causa: passare 23KB come argomento singolo a `execSync` supera il limite
del syscall `execve`. Bash su Linux ha `ARG_MAX` ~128KB ma con escape
`'\''` il quoting raddoppia/triplica i bytes.

## Effetto

Task grandi entrano in **loop di errore silenzioso**: MAESTRO li riprova
a ogni ciclo (15s), fallisce ogni volta, non scrive `results/`, non
manda email FORGE. Alberto non se ne accorge se non guarda i log tmux.

## Fix

Sostituire l'approccio "argv-only" con un approccio "via file temporaneo":

1. Scrivi il prompt in `/tmp/nexo-maestro-prompt-{ts}.txt`
2. Usa `tmux load-buffer <file>` per caricare il contenuto nel buffer tmux
3. Usa `tmux paste-buffer -t SESSION` per incollarlo nel pannello
4. Manda `C-m` per inviare
5. Cancella il file temp

Questi comandi tmux non hanno limite di dimensione del contenuto —
leggono dal file direttamente.

## Modifica

In `maestro.mjs`, sostituisci la funzione `sendToTmux` (intorno alla riga 443):

```javascript
function sendToTmux(text) {
  // Per testi >8KB, usare load-buffer + paste-buffer per evitare
  // "command too long" di execSync. Per testi piccoli, send-keys -l
  // resta più veloce e affidabile.
  const SMALL_THRESHOLD = 8000;

  if (text.length < SMALL_THRESHOLD) {
    const escaped = text.replace(/'/g, "'\\''");
    execSync(`tmux send-keys -t ${TMUX_SESSION} -l '${escaped}'`);
    execSync('sleep 1');
    execSync(`tmux send-keys -t ${TMUX_SESSION} C-m`);
    return;
  }

  // Path "grande": file temp + load-buffer + paste-buffer
  const tmpFile = `/tmp/nexo-maestro-prompt-${Date.now()}-${process.pid}.txt`;
  try {
    writeFileSync(tmpFile, text, { encoding: 'utf-8' });
    // load-buffer carica il file nel paste buffer di tmux
    execSync(`tmux load-buffer -b nexo-prompt ${tmpFile}`);
    // paste-buffer incolla il buffer nel pannello target
    execSync(`tmux paste-buffer -b nexo-prompt -t ${TMUX_SESSION}`);
    // libera il buffer
    try { execSync(`tmux delete-buffer -b nexo-prompt`); } catch {}
    execSync('sleep 1');
    execSync(`tmux send-keys -t ${TMUX_SESSION} C-m`);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
```

Importa `unlinkSync` insieme agli altri se non c'è già (cerca il blocco
`import ... from 'fs'` in cima al file e aggiungi `unlinkSync` alla lista).
`writeFileSync` è già importato.

## Test

1. **Test piccolo task** (deve usare il path send-keys come prima):
   crea `tasks/test-small-fix.md` con 100 righe di prompt qualunque,
   verifica che MAESTRO lo esegua come faceva prima.

2. **Test grande task** (deve usare il path load-buffer):
   - sposta il task archiviato indietro: `git mv tasks/_archived/setup-nexo-forge-too-big.md tasks/setup-nexo-forge.md`
   - committa e pusha
   - verifica nei log MAESTRO che NON appaia "command too long"
   - verifica che Claude Code riceva il prompt completo (controlla pane tmux)

## Output

Scrivi `results/fix-maestro-sendtotmux.md`:

```markdown
# Fix MAESTRO sendToTmux command-too-long — applicato

## Modifiche
- maestro.mjs: sendToTmux ora usa load-buffer/paste-buffer per task >8KB
- maestro.mjs: import unlinkSync aggiunto se mancava

## Test
- Task piccolo (test-small-fix.md, 100 righe): PASS via send-keys ✅
- Task grande (setup-nexo-forge.md, 23KB): PASS via load-buffer ✅

## Note
- File temp scritti in /tmp/nexo-maestro-prompt-*.txt, eliminati al termine
- Buffer tmux nominato 'nexo-prompt', deleted-buffer al termine
```

## Cose da NON fare

- Non rimuovere completamente il path send-keys: è più veloce per task piccoli
- Non lasciare il file temp dopo l'uso (security + disk usage)
- Non fare retry automatici se load-buffer fallisce (potrebbe loopare)

## Commit message

`fix(maestro): sendToTmux usa load-buffer per task >8KB (risolve command-too-long)`
