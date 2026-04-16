Primo task per IRIS — il Collega Email di NEXO.

CONTESTO:
IRIS è un servizio che classifica le email aziendali in arrivo, estrae entità, suggerisce azioni, e impara dalle correzioni dell'utente. Gira su Firebase (Cloud Functions + Firestore + Firebase Hosting per la PWA).

TASK:
Crea la struttura del progetto IRIS dentro questo repo, nella cartella projects/iris/. Ecco cosa serve:

1. Crea la cartella projects/iris/

2. Crea projects/iris/README.md con:
   - Nome: IRIS — Collega Email di NEXO
   - Descrizione: sistema di classificazione email con triage intelligente
   - Stack: Firebase Cloud Functions 2nd Gen (Node.js/TypeScript), Firestore, Firebase Hosting, Claude Haiku API
   - Architettura: polling EWS ogni 30s → classificazione Haiku → Firestore → PWA
   - Stato: v0.1 in sviluppo

3. Crea projects/iris/package.json con:
   - name: nexo-iris
   - type: module
   - scripts: build, dev, deploy, test
   - dependencies: firebase-admin, firebase-functions, @anthropic-ai/sdk, dotenv
   - devDependencies: typescript, @types/node, vitest, tsx

4. Crea projects/iris/tsconfig.json strict mode, ESM, target ES2022, module NodeNext

5. Crea la struttura cartelle:
   projects/iris/
   ├── src/
   │   ├── email-ingestion/    (modulo EWS)
   │   ├── classifier/         (modulo classificazione Haiku)
   │   ├── entities/           (estrazione entità)
   │   ├── memory/             (feedback loop e correzioni)
   │   ├── api/                (endpoint HTTPS per PWA)
   │   └── types/              (tipi condivisi)
   ├── prompts/
   │   └── classifier.md       (prompt di classificazione, vuoto per ora)
   ├── pwa/                    (PWA, vuota per ora)
   ├── tests/
   └── .env.example

6. Nel .env.example metti:
   ANTHROPIC_API_KEY=
   EWS_URL=https://remote.gruppobadano.it/ews/exchange.asmx
   EWS_USERNAME=
   EWS_PASSWORD=
   EWS_DOMAIN=
   FIREBASE_PROJECT_ID=nexo-hub
   POLL_INTERVAL_MS=30000

7. Committa con messaggio "feat(iris): initial project structure"

NON installare le dipendenze npm (npm install) — solo creare i file.
