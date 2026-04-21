Attiva l'invio WhatsApp REALE per Alberto Contardi.

1. In Firestore (progetto garbymobile-f89ac), aggiorna il documento cosmina_config/echo_config:
   - dry_run: false

2. Poi da NEXUS Chat (via Playwright), invia:
   "manda whatsapp a Alberto: Ciao, questo è un test di NEXO. ECHO funziona!"

3. Verifica la risposta in chat — deve dire "Messaggio WhatsApp inviato" (non "simulato")

4. Screenshot del risultato

5. Se l'invio fallisce (Waha down, errore API), stampa l'errore e rimetti dry_run: true

6. Committa con "feat(echo): primo invio WhatsApp reale ad Alberto"
