Implementa il bottone "Segnala bug" come descritto in tasks/dev-analysis-trzc6usXBnlyv7SGPu04.md. Segui esattamente la proposta.

1. In projects/nexo-pwa/public/css/main.css aggiungi il blocco CSS per .report-bug-btn e .report-bug-modal come descritto nella sezione 3.1 dell'analisi

2. In projects/nexo-pwa/public/index.html aggiungi il bottone e il modal HTML come descritto nella sezione 3.1

3. In projects/nexo-pwa/public/js/app.js aggiungi:
   - Wire bottone → apre modal
   - Submit → submitBugReport() che scrive in nexo_dev_requests
   - Toast "Segnalazione inviata. Claude Code la sta analizzando."
   - Rate limit: disabilita bottone 30s dopo invio
   - Mostra bottone solo dopo auth completata

4. Deploy: firebase deploy --only hosting --project nexo-hub-15f2d

5. Testa con Playwright:
   - Apri PWA, login
   - Verifica bottone visibile in alto a destra
   - Click → modal si apre
   - Scrivi "test bug report" → invia
   - Verifica toast conferma
   - Verifica documento creato in nexo_dev_requests
   - Screenshot

6. Committa con "feat(pwa): bottone segnala bug globale"
