ECHO ha ancora stub "Not implemented". Implementa la logica REALE.

1. Trova le credenziali Waha in: /mnt/c/HERMES/.env o cerca in ~/acg_suite/ per WAHA_API_URL
   Se non trovi Waha, cerca nel codice COSMINA Inbox come si connette a Waha.

2. Implementa sendWhatsApp in projects/echo/src/actions/index.ts:
   - HTTP POST a Waha API /api/sendText
   - Body: { chatId: "39XXXXXXXXXX@c.us", text: body, session: "default" }
   - Salva il messaggio in Firestore echo_messages
   - Gestisci errori

3. Implementa il listener Lavagna che ascolta messaggi per "echo"

4. Aggiorna la Cloud Function nexusRouter per gestire comandi tipo "manda WA a..."

5. Testa: da NEXUS chat scrivi "manda un WA ad Alberto con scritto NEXO è operativo"
   - Usa Playwright per testare
   - Analizza screenshot e scrivi risultato testuale

6. Rideploya functions + hosting
7. Committa con "feat(echo): implementazione reale WhatsApp via Waha"
