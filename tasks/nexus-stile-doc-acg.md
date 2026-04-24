Lo stile della chat NEXUS non piace. Deve seguire lo stile dell'app DOC della ACG Suite.

1. Leggi il codice dell'app DOC per capire il design:
   - Cerca in ~/acg_suite/ la cartella DOC (potrebbe essere COSMINA/firebase/doc/ o simile)
   - Leggi il CSS/HTML principale
   - Identifica: colori, font, spaziature, bottoni, card, layout

2. Fai screenshot dell'app DOC con Playwright:
   - Apri l'URL di DOC (cerca in acgsuite.web.app o nella landing)
   - Screenshot della pagina principale
   - Analizza lo screenshot per capire lo stile visivo

3. Applica lo STESSO stile alla chat NEXUS:
   - Stessi colori (sfondo, testo, accenti)
   - Stessi font
   - Stesse spaziature
   - Stessi bordi e ombre
   - Stessi bottoni
   - Coerenza con il resto della Suite ACG

4. Applica anche a tutta la PWA NEXO (sidebar, header, pagine Colleghi) — non solo la chat

5. Screenshot prima/dopo
6. Deploy hosting
7. Committa con "fix(pwa): stile coerente con app DOC della ACG Suite"
