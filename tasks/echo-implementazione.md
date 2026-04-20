PREREQUISITO: esegui dopo memo-implementazione.

Implementa ECHO — Collega Comunicazione. Secondo Collega da attivare.

CONTESTO:
ECHO gestisce tutta la comunicazione in uscita di NEXO. Per v0.1 implementiamo WhatsApp via Waha (già operativo su Hetzner per COSMINA Inbox).

PREREQUISITI:
- Scaffolding in projects/echo/
- Waha già operativo su Hetzner (controlla /mnt/c/HERMES/.env per WAHA_API_URL e WAHA_API_KEY, oppure cerca nei file di COSMINA Inbox ~/acg_suite/)
- Leggi ~/acg_suite/CLAUDE.md per info su COSMINA Inbox / Waha

COSA IMPLEMENTARE:

1. Implementa sendWhatsApp(to, body) in projects/echo/src/actions/index.ts:
   - Chiama Waha API: POST /api/sendText con sessionName, chatId (numero@c.us), text
   - Gestisci errori, retry 1 volta
   - Salva in Firestore echo_messages

2. Implementa sendEmail(to, subject, body) — usa exchangelib come IRIS:
   - Connessione a remote.gruppobadano.it
   - Invia email
   - Salva in echo_messages

3. Implementa il listener sulla Lavagna:
   - Ascolta nexo_lavagna where to == "echo" and status == "pending"
   - Tipo "notifica": manda su canale preferito dell'utente
   - Tipo "alert": manda WA urgente ad Alberto

4. Integra con NEXUS — aggiorna Cloud Function nexusRouter:
   - Handler per "manda WA a...", "notifica...", "avvisa..."
   - Quando l'utente chiede di mandare un messaggio: ECHO lo manda davvero via Waha
   - Rispondi in chat: "Messaggio WhatsApp inviato a [destinatario]"

5. Configura il numero WhatsApp di Alberto nel .env

6. Testa con Playwright:
   - NEXUS chat: "manda un WA ad Alberto con scritto test NEXO funziona"
   - Verifica che il messaggio arrivi su WhatsApp (controlla Waha API logs)
   - Screenshot + analisi testuale

7. Aggiorna PWA: pallino ECHO da grigio a verde

8. Rideploya tutto
9. Committa con "feat(echo): implementazione v0.1 - WhatsApp via Waha + email EWS"
