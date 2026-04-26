Due problemi da fixare:

## 1. Le dev-request nella PWA IRIS non mostrano lo stato reale

Le richieste di sviluppo restano tutte "In attesa" anche quando sono state completate.

Fix:
- Quando Claude Code completa una dev-request (scrive results/dev-request-*.md o implements), aggiorna il documento Firestore in nexo_dev_requests con status="completata"
- La PWA deve mostrare lo stato corretto: In attesa / In corso / Completata con colore diverso (grigio/giallo/verde)
- Verifica le 3 dev-request attuali e aggiorna il loro stato:
  * "aggiungi un bottone blu per segnalare un bug" → status="completata" (implementato)
  * "mettiamo un tasto ARCHIVIA e un tasto ELIMINA" → status="completata" (implementato)  
  * "Errore archiviazione: Sessione scaduta" → status="in_corso" (nuovo bug da fixare)

## 2. Errore "Sessione scaduta, rifai login" quando si archivia

Alberto clicca Archivia e riceve errore sessione scaduta.

Fix:
- Il problema è che la PWA gira in MOCK_MODE ma l'endpoint richiede auth
- Nel fix precedente è stato aggiunto il fallback X-Forge-Key, ma potrebbe non funzionare in produzione
- Verifica: la PWA deployata usa MOCK_MODE? Se sì, il fallback X-Forge-Key deve funzionare
- Se no: il token Firebase Auth scade e non viene refreshato
- Fix: aggiungi auto-refresh del token prima di ogni chiamata API:
  ```javascript
  async function getAuthToken() {
    const user = firebase.auth().currentUser;
    if (user) {
      return await user.getIdToken(true); // force refresh
    }
    return null;
  }
  ```
- Se il token è null E non siamo in MOCK_MODE: mostra "Sessione scaduta, rifai login" con bottone che fa redirect al login
- Se siamo in MOCK_MODE: usa X-Forge-Key senza errore

## Deploy functions + hosting
## Testa con Playwright: archivia una email, verifica che funzioni senza errore sessione
## Manda email report: "NEXO FORGE: fix-dev-requests-stato-e-sessione [PASS/FAIL]"
## Committa con "fix(iris): stato dev-requests + errore sessione archiviazione"
