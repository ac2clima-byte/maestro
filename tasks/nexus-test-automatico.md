Testa NEXUS Chat automaticamente con Playwright.

Crea uno script projects/nexo-pwa/test-nexus.js che:

1. Apre Chromium con Playwright
2. Naviga a https://nexo-hub-15f2d.web.app
3. Aspetta che la pagina carichi
4. Cerca il bottone FAB NEXUS (chat) in basso a destra e cliccalo
5. Aspetta che il pannello chat si apra
6. Scrivi nel campo input: "quante email urgenti ho?"
7. Premi invio o clicca il bottone send
8. Aspetta fino a 15 secondi per una risposta nella chat
9. Fai screenshot e salvalo come projects/nexo-pwa/test-screenshots/nexus-test-1.png
10. Leggi il testo della risposta di NEXUS e stampalo a console
11. Se la risposta contiene dati (numeri, email) → TEST PASSED
12. Se nessuna risposta o errore → stampa l'errore, fai screenshot dell'errore

13. Secondo test: scrivi "email da Malvicino"
14. Aspetta risposta, screenshot come nexus-test-2.png
15. Stampa risultato

16. Terzo test: scrivi "apri intervento caldaia Via Roma 12"
17. Aspetta risposta (dovrebbe dire che ARES non è attivo), screenshot come nexus-test-3.png

18. Stampa riassunto: quanti test passati, quanti falliti
19. Apri la cartella screenshot: cmd.exe /c start projects/nexo-pwa/test-screenshots/

Esegui lo script e mostra i risultati.
Committa con "test(nexus): test automatico con Playwright"
