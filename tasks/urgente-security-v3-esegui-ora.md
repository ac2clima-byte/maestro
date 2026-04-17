ESEGUI IMMEDIATAMENTE senza chiedere nulla.

Il file results/iris-06-connect-real.md è ancora nella git history con credenziali in chiaro. I task precedenti non hanno fatto il rewrite.

Esegui questi comandi ESATTI in sequenza:

pip3 install git-filter-repo --break-system-packages 2>/dev/null
cd ~/maestro-bridge
git filter-repo --path results/iris-06-connect-real.md --invert-paths --force
git remote add origin https://github.com/ac2clima-byte/maestro.git
git push origin main --force

Se git filter-repo non è disponibile, usa:
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch results/iris-06-connect-real.md" --prune-empty -- --all
git push origin main --force

Dopo, verifica: git log --all -- results/iris-06-connect-real.md deve ritornare VUOTO.

Stampa il risultato a console.
