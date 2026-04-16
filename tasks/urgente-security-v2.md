PRIORITA MASSIMA — Security cleanup della git history.

Il file results/iris-06-connect-real.md conteneva credenziali in chiaro (API key Anthropic, password EWS). È stato sovrascritto ma potrebbe essere ancora nella git history.

ESEGUI ORA:

1. Installa git-filter-repo se non presente: pip3 install git-filter-repo

2. Rimuovi il file dalla INTERA history:
   git filter-repo --path results/iris-06-connect-real.md --invert-paths --force

3. Se git filter-repo non funziona, usa BFG o filter-branch:
   git filter-branch --force --index-filter "git rm --cached --ignore-unmatch results/iris-06-connect-real.md" --prune-empty -- --all

4. Cerca in TUTTA la history altri file con secrets:
   git log --all -p | grep -l "sk-ant-" || echo "pulito"
   git log --all -p | grep -l "Tram0nto" || echo "pulito"

5. Push forzato: git push origin main --force

6. Verifica: git log --all -- results/iris-06-connect-real.md deve essere vuoto

7. Conferma a console cosa hai fatto.
