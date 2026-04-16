Fase 6 di IRIS — Collegamento a dati reali.

TASK:

1. Leggi le credenziali EWS dal file /mnt/c/HERMES/.env (cerca OUTLOOK_USER, OUTLOOK_PASSWORD). Copiale nel file projects/iris/.env (NON .env.example, il .env vero). Il .env deve contenere:
   - ANTHROPIC_API_KEY (leggila da ~/maestro-bridge/.env o da /mnt/c/HERMES/.env, cerca ANTHROPIC_API_KEY)
   - EWS_URL=https://remote.gruppobadano.it/ews/exchange.asmx
   - EWS_USERNAME=(quello che trovi in OUTLOOK_USER)
   - EWS_PASSWORD=(quello che trovi in OUTLOOK_PASSWORD)
   - FIREBASE_PROJECT_ID=nexo-hub-15f2d
   - POLL_INTERVAL_MS=30000

2. Fai un test reale di connessione EWS: esegui lo script ews_poller.py con le credenziali reali per leggere le ultime 3 email dalla inbox di Alberto. NON modificare nulla nella casella email, solo leggere. Stampa: mittente, oggetto, data per ogni email trovata.

3. Se il test EWS funziona, fai un test reale di classificazione: prendi una delle email lette e passala al Classifier con la API key Anthropic reale. Stampa il risultato della classificazione (categoria, riassunto, entità, azione, confidenza).

4. Scrivi i risultati di entrambi i test in un file projects/iris/TEST_REALE.md

5. Committa con "test(iris): first real EWS + classification test"

ATTENZIONE: 
- NON committare il file .env (deve essere in .gitignore)
- Se qualcosa fallisce, scrivi l'errore in TEST_REALE.md e committa comunque
- Non modificare, cancellare o rispondere a nessuna email
