Il polling IRIS non funziona. Le Cloud Functions su GCP non raggiungono il server Exchange on-premise. L'ultima email in iris_emails è del 17 aprile.

SOLUZIONE DEFINITIVA: polling sul PC di Alberto (WSL), non su GCP.

1. Crea uno script che gira in background su WSL: scripts/iris_local_poller.sh
   - Ogni 5 minuti esegue la pipeline: python3 ~/maestro-bridge/projects/iris/scripts/pipeline.py
   - Log in ~/maestro-bridge/logs/iris_poller.log
   - PID file per evitare doppie esecuzioni

2. Lo script deve:
   - Connettersi a EWS (exchangelib) — dal PC funziona perché è nella stessa rete
   - Leggere email nuove (dal watermark dell'ultima processata)
   - Classificare con Haiku API
   - Salvare in Firestore iris_emails (nexo-hub-15f2d)
   - Eseguire le regole (RuleEngine)

3. Aggiungi un comando di avvio in start-maestro.sh (o crea start-iris-poller.sh):
   ```bash
   # Avvia poller IRIS in background
   nohup bash ~/maestro-bridge/scripts/iris_local_poller.sh &
   ```

4. ALTERNATIVA se il PC non è sempre acceso: adatta lo script per Hetzner
   - Lo script iris_hetzner_poller.py esiste già (325 righe)
   - Ma Hetzner può raggiungere remote.gruppobadano.it? Testa:
     curl -k https://remote.gruppobadano.it/EWS/Exchange.asmx 2>&1 | head -5
   - Se raggiungibile: configura cron su Hetzner
   - Se non raggiungibile: resta sul PC locale

5. Disabilita le Cloud Functions irisPoller/irisPollScheduled che non funzionano:
   - Commenta gli export in index.js
   - Rideploya functions per non sprecare risorse

6. Testa: aspetta 5 minuti, verifica che nuove email appaiano in iris_emails

7. Committa con "fix(iris): polling locale WSL ogni 5 minuti"
