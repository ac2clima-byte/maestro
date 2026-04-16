URGENTE — Security cleanup.

1. Cerca in TUTTI i file del repo (specialmente results/, projects/, context/) qualsiasi occorrenza di:
   - Stringhe che iniziano con "sk-ant-" (API key Anthropic)
   - Password in chiaro (cerca "Tram0nto", "OUTLOOK_PASSWORD", qualsiasi password)
   - Credenziali EWS
   Elenca i file trovati.

2. Rimuovi TUTTI questi file dalla git history con git filter-branch o git filter-repo:
   - results/iris-06-connect-real.md (confermato contenere secrets)
   - Qualsiasi altro file trovato al punto 1

3. Fai git push --force origin main

4. Verifica che la history sia pulita: git log --all --full-history -- results/iris-06-connect-real.md deve ritornare vuoto

5. Aggiungi al .gitignore: *.env, e una regola che impedisca di committare file contenenti "sk-ant-"

6. Crea un file context/security-rules.md con:
   - MAI includere output raw di console nei file pushati su GitHub
   - MAI loggare credenziali, API key, password
   - I file results/ devono contenere solo riassunti testuali, mai output completo
   - Controlla sempre prima di committare che non ci siano secrets

7. Committa con "security: remove leaked credentials from history"
