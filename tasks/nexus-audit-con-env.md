L'audit NEXUS è bloccato dall'auth. Le credenziali sono già nei file .env del progetto.

1. Cerca le credenziali di login ACG Suite:
   grep -r "EMAIL\|PASSWORD\|LOGIN\|AUTH\|USER" projects/iris/.env projects/nexo-pwa/.env ~/maestro-bridge/.env /mnt/c/HERMES/.env 2>/dev/null | grep -iv "EWS\|ANTHROPIC\|WAHA\|SECRET\|API_KEY"

2. Se non trovi credenziali specifiche per la PWA, cerca come funziona il login:
   - Leggi il codice auth nella PWA (js/app.js o index.html, cerca signInWithEmailAndPassword)
   - Qual è il progetto Firebase usato per l'auth? (garbymobile-f89ac?)
   - Lista gli utenti: firebase auth:list-users --project garbymobile-f89ac 2>/dev/null | head -5

3. Se trovi l'email, imposta le variabili e rilancia l'audit completo:
   export NEXO_TEST_EMAIL='email_trovata'
   export NEXO_TEST_PASSWORD='password_trovata'
   
   Poi esegui i 15 test conversazionali end-to-end con Playwright:
   - Login nella PWA
   - Apri NEXUS Chat
   - Scrivi ogni domanda, aspetta risposta, screenshot
   - Verifica linguaggio naturale + dati reali
   - Report in results/nexus-audit-completo-e2e.html

4. Se non riesci a trovare le credenziali, stampa a console cosa hai trovato e dove hai cercato

Committa con "test(nexus): audit E2E con credenziali"
