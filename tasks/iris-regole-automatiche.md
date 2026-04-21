Implementa le regole automatiche di IRIS che scattano dopo la classificazione.

1. Assicurati che la collection iris_rules esista in Firestore con le 4 regole predefinite.
   Se non esiste, crea le regole con lo script seed_rules.py (già in projects/iris/scripts/)

2. Integra il RuleEngine nella pipeline:
   - Dopo la classificazione di ogni email, carica le regole
   - Valuta quale regola matcha
   - Esegui le azioni della regola

3. Implementa le azioni delle regole:
   - "scrivi_lavagna": scrivi messaggio su nexo_lavagna con destinatario e tipo
   - "notifica_echo": scrivi messaggio su nexo_lavagna per ECHO con canale e messaggio
   - "archivia_email": aggiorna status email a "archived" in iris_emails
   - "estrai_dati": per ora logga a console "estrazione dati da implementare"

4. Testa: esegui la pipeline sulle email esistenti e verifica che le regole scattino

5. Committa con "feat(iris): regole automatiche post-classificazione"
