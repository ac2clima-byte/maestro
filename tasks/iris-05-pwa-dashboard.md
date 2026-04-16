Fase 5 di IRIS — PWA Dashboard.

CONTESTO:
La PWA è l'interfaccia che Alberto usa dal browser (PC e telefono) per vedere le email classificate da IRIS. Deve essere una single-page app moderna, responsive, con login Firebase Auth.

TASK:
Crea la PWA in projects/iris/pwa/

1. Crea projects/iris/pwa/index.html — single page app con:
   - Login con email/password Firebase Auth
   - Dopo login, mostra la dashboard
   - La dashboard ha:
     a. Header con "IRIS — Collega Email" e bottone logout
     b. Statistiche in alto: totale email oggi, per categoria (badges colorati), % classificate correttamente
     c. Lista email classificate, ogni card mostra:
        - Mittente e oggetto
        - Categoria (badge colorato)
        - Riassunto 3 righe
        - Entità estratte (chips)
        - Azione suggerita (bottone)
        - Confidenza (indicatore visuale: verde/giallo/rosso)
        - Bottone "Correggi" per aprire un modale di correzione
     d. Filtri: per categoria, per confidenza, per data
     e. Modale di correzione: dropdown categoria, dropdown azione, campo note, bottone salva
   
   - Design: sfondo scuro #0f0f23, accenti #00d4ff (azzurro NEXO), cards con bordi sottili, font system-ui, responsive mobile-first
   - Firebase SDK caricato da CDN
   - Per ora usa dati mock hardcoded (10 email di esempio realistiche per ACG Clima Service) — la connessione Firestore reale verrà dopo

2. Crea projects/iris/pwa/firebase-config.js con:
   - Configurazione Firebase (placeholder, Alberto la compilerà)
   - Init di Auth e Firestore

3. NON usare framework (React, Vue). Solo HTML + CSS + JavaScript vanilla. La PWA deve essere un singolo file HTML autocontenuto con CSS e JS inline (più il firebase-config.js separato).

4. Testa che la pagina si apra correttamente: usa Playwright per fare screenshot di:
   - La pagina di login
   - La dashboard con dati mock (simula il login bypassando Auth per lo screenshot)
   Salva gli screenshot in projects/iris/pwa/screenshots/

5. Committa con "feat(iris): PWA dashboard with mock data"
