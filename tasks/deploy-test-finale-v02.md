Deploy e test finale NEXO v0.2.

1. Deploy tutto:
   cd projects/iris && firebase deploy --only functions --project nexo-hub-15f2d
   cd ../nexo-pwa && firebase deploy --only hosting --project nexo-hub-15f2d

2. Se il deploy functions fallisce per errori di sintassi, fixa e riprova.

3. Testa TUTTI i Colleghi via Playwright (14 test):
   - IRIS: "quante email urgenti?"
   - ECHO: "manda WA a Alberto: test v0.2 finale"
   - ARES: "interventi aperti oggi"
   - CHRONOS: "scadenze prossime"
   - MEMO: "dimmi tutto su Kristal"
   - CHARTA: "esposizione clienti"
   - EMPORION: "cosa manca in magazzino?"
   - DIKEA: "scadenze CURIT"
   - DELPHI: "KPI aprile"
   - PHARO: "stato della suite"
   - CALLIOPE: "scrivi risposta a Moraschi"
   - NEXUS multi-turno: "dimmi tutto su Kristal" poi "quanti interventi hanno avuto?"
   - Digest: esegui echoDigestRun manualmente e verifica risposta
   - Login: verifica che la PWA chieda login

4. Screenshot per ogni test
5. Analizza screenshot e scrivi report testuale
6. Report HTML: results/v02-finale-completo.html
7. Committa con "test(nexo): v0.2 deploy + test finale completo"
