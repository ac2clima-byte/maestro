Fix i 3 known issues di NEXO v0.2. Fai tutto senza fermarti.

## 1. Polling IRIS — Relay su Hetzner

Il server Exchange è on-premise, non raggiungibile da GCP. Soluzione: poller Python su Hetzner (dove già gira Waha su 178.104.88.86).

1. Crea uno script Python autonomo: scripts/iris_hetzner_poller.py
   - Usa exchangelib per connettersi a EWS (remote.gruppobadano.it)
   - Legge email nuove (watermark basato su ultima email processata in Firestore)
   - Classifica con Claude Haiku API
   - Scrive in Firestore iris_emails (progetto nexo-hub-15f2d)
   - Gira come cron ogni 5 minuti

2. Crea un file di setup per Hetzner: scripts/hetzner-setup.sh
   - Installa Python, pip, exchangelib, firebase-admin, anthropic
   - Crea crontab: */5 * * * * cd /opt/nexo && python3 iris_hetzner_poller.py >> /var/log/iris_poller.log 2>&1
   - Crea .env con credenziali (placeholder — Alberto li compila)

3. Le credenziali necessarie (da mettere nel .env su Hetzner):
   - EWS_URL=https://remote.gruppobadano.it/EWS/Exchange.asmx
   - EWS_USERNAME=alberto.contardi@acgclimaservice.com
   - EWS_PASSWORD=(da compilare manualmente)
   - ANTHROPIC_API_KEY=(da compilare manualmente)
   - FIREBASE_PROJECT_ID=nexo-hub-15f2d
   - Nota: per firebase-admin su Hetzner serve un service account JSON. Genera le istruzioni per crearlo.

4. Disabilita irisPoller/irisPollScheduled su GCP (commentali in index.js) per evitare errori inutili nei log

5. Committa con "feat(iris): poller Hetzner per EWS on-premise"

## 2. Landing ACG — Rimuovi noSSO

1. Modifica ~/acg_suite/COSMINA/firebase/landing/index.html:
   - Trova la card NEXO in APPS[]
   - Rimuovi il flag noSSO: true
   - Ora NEXO passa per il SSO come tutte le altre app

2. Deploy landing:
   cd ~/acg_suite/COSMINA/firebase && ./deploy.sh acgsuite

3. Se il deploy fallisce per quota hosting:
   - Vai su Firebase Console → Hosting → Release history → elimina le vecchie
   - Riprova

4. Committa nel repo acg_suite con "fix(landing): NEXO sotto SSO, rimosso noSSO flag"

## 3. API key Anthropic in Secret Manager

1. Verifica se il secret esiste:
   firebase functions:secrets:get ANTHROPIC_API_KEY --project nexo-hub-15f2d 2>&1

2. Se non esiste, crealo:
   - Leggi la key attuale dal .env o dal codice
   - firebase functions:secrets:set ANTHROPIC_API_KEY --project nexo-hub-15f2d
   - (inserisci la key quando richiesto)

3. Se non riesci a usare il comando interattivo, usa gcloud:
   echo -n "LA_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=- --project=nexo-hub-15f2d
   Oppure se esiste già:
   echo -n "LA_KEY" | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=- --project=nexo-hub-15f2d

4. Verifica che le Cloud Functions usino defineSecret e che funzionino dopo il redeploy

5. Rideploya functions: cd projects/iris && firebase deploy --only functions

6. Testa: chiama nexusRouter con una query e verifica che risponda

7. Committa con "fix: API key in Secret Manager"

## 4. Deploy finale + verifica

- Verifica che il login funzioni: apri nexo-hub-15f2d.web.app, deve chiedere login
- Verifica che NEXUS risponda dopo login
- Se qualcosa non funziona, logga l'errore e vai avanti
- Committa con "fix: known issues v0.2 risolti"
