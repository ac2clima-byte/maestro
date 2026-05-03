# Fix MAESTRO: per task >8KB, manda solo "leggi tasks/<id>.md ed esegui"

## Bug

Il fix precedente (`load-buffer + paste-buffer + C-m`) per task >8KB non funziona
in pratica con Claude Code TUI: il paste-buffer riempie l'input di Code ma il
`C-m` finale non sveglia l'esecuzione del prompt. Risultato: MAESTRO registra
"PASS" senza che Code abbia eseguito nulla. Visto su `setup-nexo-forge` il
2026-05-03 alle 09:35 UTC.

## Fix proposto

Per task >8KB, NON incollare il contenuto del task. Invece, mandare a Code un
prompt SHORT che gli dice di leggere il file dal disco e eseguirlo:

```
Esegui il task definito in tasks/<task-id>.md (leggilo con Read e seguine
le istruzioni. È un task self-contained, contiene tutto il necessario).
```

Questo prompt corto va via tranquillamente con `send-keys -l` standard, e
Code legge il file con il proprio `Read` tool — niente paste-buffer, niente
problemi di Enter.

## Modifica

In `maestro.mjs`, sostituisci la funzione `sendToTmux` (intorno alla riga 443)
con questa versione semplificata:

```javascript
function sendToTmux(text) {
  const escaped = text.replace(/'/g, "'\\''");
  execSync(`tmux send-keys -t ${TMUX_SESSION} -l '${escaped}'`);
  execSync('sleep 1');
  execSync(`tmux send-keys -t ${TMUX_SESSION} C-m`);
}
```

(Torna alla versione originale, semplice. Niente più dual-path.)

In `processTask` (intorno alla riga 622), modifica il blocco che costruisce
`promptText`:

```javascript
// PRIMA
const promptText = kind === 'dev-request'
  ? buildDevRequestPrompt(taskId, devId, originalContent)
  : originalContent;

// DOPO
const SHORT_LIMIT = 8000;
let promptText;
if (kind === 'dev-request') {
  // dev-request: prompt costruito da buildDevRequestPrompt — usalo sempre
  // (è già breve, contiene riferimenti al file ma non il file intero).
  promptText = buildDevRequestPrompt(taskId, devId, originalContent);
} else if (originalContent.length < SHORT_LIMIT) {
  // task piccolo: incolla direttamente
  promptText = originalContent;
} else {
  // task grande: chiedi a Code di leggere il file dal disco
  promptText = [
    `Esegui il task definito in \`tasks/${taskId}.md\`.`,
    ``,
    `Leggilo con il tuo tool Read e seguine le istruzioni alla lettera.`,
    `È un task self-contained: contiene root cause, codice da modificare,`,
    `step di test, output atteso. Non ti serve altro contesto da me.`,
    ``,
    `Quando hai finito, scrivi il result in \`results/${taskId}.md\` come`,
    `richiesto dal task, committa e pusha.`,
  ].join('\n');
}
```

**Verifica importante**: cerca dove `buildDevRequestPrompt` è chiamato altrove
nel file. Se è chiamato anche fuori da `processTask`, la modifica sopra non
basta.

## Test

1. **Task piccolo (multitech-style, ~5KB)**:
   - Code riceve il prompt completo come prima
   - Esegue normalmente
   
2. **Task grande (setup-nexo-forge, ~23KB)**:
   - Code riceve solo "Esegui il task definito in `tasks/setup-nexo-forge.md`..."
   - Code chiama `Read tasks/setup-nexo-forge.md`
   - Procede con l'esecuzione vera

3. **Dev-request (qualsiasi)**:
   - Comportamento INVARIATO. Continua a usare `buildDevRequestPrompt`.

## Verifica nel pane tmux

Dopo il deploy del fix:

1. **Cancella il result stub** di setup-nexo-forge che ha falsato il PASS
   precedente:
   ```bash
   cd <repo maestro>
   rm results/setup-nexo-forge.md
   git add -A
   git commit -m "chore(forge): rimuove result stub falso da setup-nexo-forge per ri-esecuzione"
   git push origin main
   ```

2. Alberto riavvia MAESTRO per caricare il nuovo codice.

3. Al prossimo polling, MAESTRO troverà `tasks/setup-nexo-forge.md` come
   pending (senza result), userà il prompt corto, Code leggerà il file ed
   eseguirà davvero.

Nel pane tmux di Code dovresti vedere:

```
❯ Esegui il task definito in `tasks/setup-nexo-forge.md`.
  Leggilo con il tuo tool Read e seguine le istruzioni alla lettera.
  ...

● Read tasks/setup-nexo-forge.md
● [...esecuzione vera...]
```

Se vedi solo il prompt corto e niente `Read` → il fix non funziona, fermati e
segnala.

## Output

Scrivi `results/fix-maestro-short-prompt.md`:

```markdown
# Fix MAESTRO short-prompt per task grandi — applicato

## Modifiche
- maestro.mjs: sendToTmux torna versione originale (rimosso load-buffer path)
- maestro.mjs: processTask usa prompt corto "leggi tasks/X.md" per task >8KB

## Test
- multitech-fix (~5KB): inviato come testo completo ✅
- setup-nexo-forge (~23KB): inviato come prompt corto, Code ha letto il file ✅
- dev-request: comportamento invariato ✅

## Note
- Dopo il deploy, MAESTRO va riavviato per caricare il nuovo codice
- Rimosso /tmp/nexo-maestro-prompt-* (non più usato)
```

## Cose da NON fare

- Non lasciare il vecchio path load-buffer (non funziona, è morto)
- Non modificare `buildDevRequestPrompt` (le dev-request continuano a funzionare)
- Non aggiungere logica di fallback (se short-prompt fallisce, è un bug strutturale, va affrontato)

## Commit message

`fix(maestro): per task >8KB manda prompt corto "leggi file" invece di paste-buffer`
