MAESTRO crasha continuamente con "cannot pull with rebase: You have unstaged changes". Fix DEFINITIVO.

In maestro.mjs, PRIMA di ogni git pull, aggiungi:

```javascript
// Auto-commit unstaged changes prima del pull
try {
  execSync('git add -A && git diff --cached --quiet || git commit -m "auto: unstaged changes"', { cwd: REPO_DIR, stdio: 'pipe' });
} catch(e) {
  // ignore se non c'è nulla da committare
}
```

Questo va messo nella funzione che fa il polling, PRIMA della riga git pull --rebase.

Inoltre cambia `git pull --rebase` con `git pull --rebase --autostash` che fa lo stash automatico.

Testa: crea un file sporco nel repo, avvia maestro, verifica che il pull non fallisca.

Committa con "fix(maestro): auto-commit unstaged prima di pull"
