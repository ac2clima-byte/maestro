Fase 7 di IRIS — Pipeline reale: EWS → Classificatore → Firestore → PWA.

CONTESTO:
Tutti i pezzi esistono separatamente. Ora vanno collegati in una pipeline funzionante.
Firebase project ID: nexo-hub-15f2d (region us-central1)
Le credenziali EWS sono in /mnt/c/HERMES/.env (OUTLOOK_USER, OUTLOOK_PASSWORD)
L'API key Anthropic è in ~/maestro-bridge/.env (ANTHROPIC_API_KEY) oppure in /mnt/c/HERMES/.env

TASK:

1. Crea projects/iris/src/pipeline.ts — lo script principale che:
   a. Legge le credenziali da .env (EWS + Anthropic)
   b. Chiama il poller EWS (ews_poller.py) per ottenere le ultime email
   c. Per ogni email nuova, chiama il Classifier per classificarla
   d. Salva il risultato in Firestore (collection: iris_emails)
   e. Stampa a console un riassunto di cosa ha fatto
   
   Usa firebase-admin SDK per scrivere su Firestore. Inizializza con:
   - Per sviluppo locale: usa le credenziali di default (firebase login)
   - Project ID: nexo-hub-15f2d

2. Crea projects/iris/.env copiando da .env.example e riempi:
   - ANTHROPIC_API_KEY: leggila da /mnt/c/HERMES/.env o da ~/maestro-bridge/.env
   - EWS_URL: https://remote.gruppobadano.it/ews/exchange.asmx
   - EWS_USERNAME: leggilo da /mnt/c/HERMES/.env (campo OUTLOOK_USER)
   - EWS_PASSWORD: leggilo da /mnt/c/HERMES/.env (campo OUTLOOK_PASSWORD)
   - EWS_DOMAIN: estrai dal username (la parte dopo @)
   - FIREBASE_PROJECT_ID: nexo-hub-15f2d

3. Esegui la pipeline UNA VOLTA in modalità test:
   - Leggi le ultime 3 email dalla inbox
   - Classificale con Haiku
   - Salva in Firestore
   - Stampa i risultati a console
   - Apri la console Firebase Firestore nel browser per mostrare i dati: cmd.exe /c start "https://console.firebase.google.com/project/nexo-hub-15f2d/firestore"

4. Dopo il test, aggiorna la PWA (projects/iris/pwa/index.html) per leggere da Firestore REALE invece dei mock:
   - Aggiungi la config Firebase reale in firebase-config.js
   - Sostituisci i dati mock con query Firestore sulla collection iris_emails
   - Rideploya su Firebase Hosting: cd projects/iris && firebase deploy --only hosting
   - Apri https://nexo-hub-15f2d.web.app nel browser

5. Committa con "feat(iris): pipeline reale EWS → Haiku → Firestore → PWA"

ATTENZIONE:
- Il .env con le credenziali NON va committato (aggiungilo al .gitignore se non c'è)
- Disabilita TLS verification per EWS (certificato self-signed)
- La PWA per ora non ha login (bypassato nel task precedente)
