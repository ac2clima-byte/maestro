Il bottone Archivia su IRIS non funziona. Fix.

1. Apri la PWA con Playwright, vai sulla pagina IRIS, clicca Archivia su una email
2. Screenshot dell'errore (console browser + UI)
3. Verifica:
   - Il bottone chiama quale endpoint? (irisArchiveEmail?)
   - L'endpoint è deployato? curl -s https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/irisArchiveEmail → deve dare 401 o 405, non 404
   - Il frontend passa i parametri corretti? (emailId, messageId)
   - L'handler in handlers/iris.js esiste e funziona?

4. Logica corretta dell'archiviazione:
   - Prende il mittente dell'email (es. "Davide Torriglia")
   - Inverte cognome/nome → "Torriglia Davide"
   - Su Exchange (EWS): cerca/crea cartella con quel nome sotto Inbox
   - Sposta l'email nella cartella
   - Aggiorna iris_emails in Firestore: status="archived"
   
   PROBLEMA NOTO: EWS non è raggiungibile da Cloud Functions (server on-premise).
   SOLUZIONE: la Cloud Function segna solo status="archived" in Firestore. Lo spostamento su Exchange lo fa il poller locale su WSL (o lo facciamo dopo).

5. Fix minimo che deve funzionare ORA:
   - Click Archivia → chiama Cloud Function → aggiorna iris_emails status="archived" → email diventa grigia nella PWA
   - Lo spostamento fisico su Exchange è un TODO futuro

6. Stessa cosa per Elimina:
   - Click Elimina → conferma → aggiorna iris_emails status="deleted" → email scompare dalla lista

7. Deploy functions + hosting
8. Testa con Playwright: click Archivia, click Elimina, screenshot
9. Manda email report a ac2clima@gmail.com:
   curl -X POST https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoSendReport \
     -H "Content-Type: application/json" \
     -d '{"to":"ac2clima@gmail.com","subject":"NEXO FORGE: fix-iris-archivia [PASS/FAIL]","body":"[dettagli]","forgeKey":"nexo-forge-2026"}'

10. Committa con "fix(iris): archivia e elimina email funzionanti"
