MAESTRO continua a crashare con "cannot pull with rebase: You have unstaged changes". Il fix auto-commit precedente non funziona.

FIX DEFINITIVO in maestro.mjs:

Trova la funzione che fa git pull e sostituisci:

PRIMA:
```javascript
execSync('git pull --rebase origin main', { cwd: REPO_DIR });
```

DOPO:
```javascript
try {
  // Committa TUTTO prima del pull
  execSync('git add -A', { cwd: REPO_DIR, stdio: 'pipe' });
  try {
    execSync('git commit -m "auto: pre-pull commit" --allow-empty-message', { cwd: REPO_DIR, stdio: 'pipe' });
  } catch(e) { /* niente da committare, ok */ }
  // Pull con autostash
  execSync('git pull --rebase --autostash origin main', { cwd: REPO_DIR, stdio: 'pipe' });
} catch(e) {
  // Se ancora fallisce: force reset
  try {
    execSync('git stash && git pull --rebase origin main && git stash pop', { cwd: REPO_DIR, stdio: 'pipe' });
  } catch(e2) {
    console.log('[PULL ERROR] ' + e2.message);
  }
}
```

Questo deve essere applicato in TUTTI i punti dove maestro.mjs fa git pull. Cerca con grep tutti i `git pull` nel file e fixali tutti.

Testa: crea un file sporco nel repo, avvia maestro, verifica che il pull non fallisca.

Committa con "fix(maestro): autostash definitivo - mai più unstaged errors"
