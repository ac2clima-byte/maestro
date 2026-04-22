Deploy e test finale NEXO v0.2.

1. Deploy tutto:
   cd projects/iris && firebase deploy --only functions --project nexo-hub-15f2d
   cd ../nexo-pwa && firebase deploy --only hosting --project nexo-hub-15f2d

2. Se il deploy functions fallisce per errori di import o sintassi, fixali e riprova.

3. Testa TUTTI i Colleghi via script (chiamata diretta alla Cloud Function, non Playwright):
   Per ogni Collega manda una query al nexusRouter e verifica la risposta.

4. Test extra:
   - Contesto multi-turno: manda "dimmi tutto su Kristal" poi "quanti interventi hanno avuto?"
   - Digest: invoca echoDigestRun manualmente e verifica output

5. Crea report: results/v02-finale-deploy.html con tutti i risultati
6. Apri nel browser
7. Committa con "deploy(nexo): v0.2 finale - 15 Cloud Functions + 16 handler"
