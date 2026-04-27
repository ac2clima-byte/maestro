Il modal del bottone bug 🐛 richiede la descrizione obbligatoria. NON deve essere obbligatoria.

Fix nella PWA (js/app.js o index.html):
1. Trova il modal bug report
2. Rimuovi il controllo "required" o la validazione che blocca l'invio se la textarea è vuota
3. Se la descrizione è vuota: invia comunque con nota "(nessuna nota — vedi conversazione)"
4. Il bottone Invia deve funzionare sempre, con o senza descrizione

Deploy hosting.
Email report.
Committa con "fix(nexus): descrizione bug opzionale"
