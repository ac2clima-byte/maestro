ECHO mostra "Collega non ancora attivo" quando l'utente chiede di mandare un WhatsApp. Il codice sendWhatsApp è implementato in projects/echo/src/actions/index.ts con Waha API, ma la Cloud Function nexusRouter non lo usa.

FIX: integra l'invio WhatsApp reale nella Cloud Function nexusRouter.

1. Nel file projects/iris/functions/index.js, trova l'handler per ECHO/WhatsApp

2. Invece di rispondere con "Collega non ancora attivo", implementa l'invio reale:
   - Leggi WAHA_API_URL e WAHA_API_KEY da Firestore (cosmina_config/whatsapp sul progetto garbymobile-f89ac, come fa già il codice ECHO)
   - Oppure leggi da Secret Manager se li hai già configurati
   - POST a ${WAHA_URL}/api/sendText con: chatId (numero@c.us), text, session "default"
   - Header: X-Api-Key

3. Il numero di Alberto per WhatsApp: cercalo nel .env di HERMES o ECHO, oppure in cosmina_config/whatsapp

4. Sicurezza: 
   - Mantieni ECHO_DRY_RUN=true come default — controlla una variabile environment o un flag in Firestore
   - Se DRY_RUN: rispondi "Messaggio WhatsApp simulato (DRY_RUN attivo). Contenuto: ..."
   - Se NON DRY_RUN: invia realmente

5. Per ora attiva DRY_RUN=false così possiamo testare l'invio reale

6. Testa con Playwright:
   - NEXUS chat: "manda whatsapp a Alberto: NEXO è operativo"
   - Verifica risposta in chat
   - Screenshot + analisi testuale

7. Rideploya functions
8. Committa con "feat(echo): WhatsApp reale integrato in nexusRouter"
