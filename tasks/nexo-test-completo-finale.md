PREREQUISITO: esegui dopo iris-polling-24-7 e iris-regole-automatiche.

Test completo finale di NEXO v0.1.

1. Apri https://nexo-hub-15f2d.web.app con Playwright

2. Testa OGNI Collega via NEXUS Chat (1 domanda per Collega):
   - IRIS: "quante email ho ricevuto oggi?"
   - ARES: "interventi aperti"
   - CHRONOS: "scadenze prossime"
   - MEMO: "dimmi tutto su Kristal"
   - CHARTA: "report mensile aprile 2026"
   - ECHO: "manda whatsapp a Alberto: test finale NEXO v0.1" (dry-run)
   - EMPORION: "cosa manca in magazzino?"
   - DIKEA: "scadenze CURIT"
   - DELPHI: "KPI di questo mese"
   - PHARO: "stato della suite"
   - CALLIOPE: "scrivi risposta a Moraschi Roberto"

3. Screenshot per ogni test

4. Analizza TUTTI gli screenshot e crea un report finale:
   projects/nexo-pwa/test-screenshots/REPORT-FINALE-V01.md
   Con per ogni test: domanda, risposta, screenshot, esito (PASS/FAIL)

5. Crea anche un report HTML bello da vedere con statistiche:
   - Colleghi attivi: X/11
   - Test passati: X/11
   - Cloud Functions deployate
   - Stato polling
   - Stato regole

6. Apri il report HTML nel browser

7. Committa con "test(nexo): report finale v0.1 completo"
