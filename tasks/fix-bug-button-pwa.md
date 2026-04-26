Il bottone 🐛 nella chat NEXUS non funziona dalla PWA (telefono). Il bug report non arriva.

1. Apri la PWA con Playwright in viewport mobile (375x812)
2. Login, apri NEXUS Chat
3. Scrivi "ciao", aspetta risposta
4. Clicca il bottone 🐛
5. Cattura errori console: page.on('console') e page.on('pageerror')
6. Se il bottone non fa nulla:
   - Verifica che l'onclick sia registrato (potrebbe non funzionare su mobile touch)
   - Aggiungi sia onclick che ontouchend
   - Verifica z-index: il bottone potrebbe essere sotto un altro elemento
   - Verifica che la scrittura su Firestore nexo_dev_requests funzioni (auth, permessi)
7. Se il modal si apre ma non invia:
   - Verifica la funzione submitBugFromChat
   - Stampa errori
8. Testa anche su viewport desktop per confronto

Deploy hosting + test + email report.
Committa con "fix(nexus): bottone bug funzionante su mobile PWA"
