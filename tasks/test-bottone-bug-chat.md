Alberto dice che il bottone bug nella chat NEXUS non fa nulla quando lo clicca.

1. Apri la PWA con Playwright, login, apri NEXUS Chat
2. Scrivi "ciao" e aspetta risposta
3. Clicca il bottone 🐛 nell'header della chat
4. Screenshot: si apre un modal? Appare qualcosa?
5. Se si apre il modal: scrivi "test bug" nella textarea e clicca Invia
6. Verifica che venga creato un documento in nexo_dev_requests con type="bug_from_chat" e la conversazione
7. Se il bottone NON fa nulla:
   - Apri console browser con Playwright: page.on('console')
   - Clicca il bottone
   - Stampa errori JavaScript
   - Fix: probabilmente manca l'event listener onclick o il selettore è sbagliato
8. Se il modal si apre ma non invia: verifica la funzione submitBugFromChat o equivalente

Deploy + test + email report.
Committa con "fix(nexus): bottone bug funzionante in chat"
