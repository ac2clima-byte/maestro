Deploy e test finale NEXO v0.2.

1. Deploy TUTTO:
   cd projects/iris && firebase deploy --only functions --project nexo-hub-15f2d
   cd ../nexo-pwa && firebase deploy --only hosting --project nexo-hub-15f2d
   cd ../iris && firebase deploy --only firestore:rules --project nexo-hub-15f2d

2. Se il deploy functions fallisce per errori di import/syntax:
   - Leggi l'errore
   - Fixa il file handlers/*.js
   - Rideploya

3. Testa TUTTI i Colleghi via Playwright (apri https://nexo-hub-15f2d.web.app):
   - IRIS: "quante email urgenti?"
   - ECHO: "manda WA a Alberto: test finale v0.2"
   - ARES: "interventi aperti oggi"
   - CHRONOS: "scadenze prossime"
   - MEMO: "dimmi tutto su Kristal"
   - CHARTA: "fatture scadute"
   - EMPORION: "cosa manca in magazzino?"
   - DIKEA: "scadenze CURIT"
   - DELPHI: "KPI di aprile"
   - PHARO: "stato della suite"
   - CALLIOPE: "scrivi risposta a Moraschi"

4. Testa anche:
   - Contesto multi-turno: "dimmi tutto su Kristal" poi "quanti interventi hanno avuto?"
   - Orchestratore: crea un messaggio test sulla Lavagna con to="orchestrator" tipo="guasto_urgente"

5. Screenshot per ogni test
6. Analizza screenshot e crea report: results/v02-finale-completo.html
7. Apri nel browser
8. Committa con "test(nexo): v0.2 deploy + test finale completo"
