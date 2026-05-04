# Credenziali GitHub App per nexo-forge

APP_ID: 3594152
INSTALLATION_ID: 129338879
PRIVATE_KEY_PATH: ~/.nexo-forge-gh-app.pem

---

NOTA: questo task è la prosecuzione di setup-nexo-forge.md.
Esegui Fase C come descritto in tasks/setup-nexo-forge.md sezione "Fase C":

1. Leggi APP_ID, INSTALLATION_ID e il file PEM da PRIVATE_KEY_PATH
2. Salva i 3 secrets su Secret Manager del progetto nexo-hub-15f2d:
   - NEXO_FORGE_GH_APP_ID = 3594152
   - NEXO_FORGE_GH_INSTALLATION_ID = 129338879
   - NEXO_FORGE_GH_PRIVATE_KEY = contenuto del file ~/.nexo-forge-gh-app.pem
3. Cancella questo file (tasks/setup-nexo-forge-creds.md) dal repo dopo aver letto i valori, committa "chore(forge): rimuove setup-nexo-forge-creds dopo ingestion"
4. Deploya nexoForgeTask: cd projects/iris && firebase deploy --only functions:nexoForgeTask --project=nexo-hub-15f2d
5. Smoke test end-to-end con curl + HMAC come descritto in tasks/setup-nexo-forge.md sezione C4
6. Sovrascrivi results/setup-nexo-forge.md con la versione definitiva (URL Function + i 2 secrets per Claude Chat)
7. Committa e pusha tutto

NOTA IMPORTANTE: la GitHub App si chiama "nexo-forge-acg-v2" (la prima v1 era sotto un account diverso e non poteva installarsi sul repo). Owner: ac2clima-byte. Installazione su ac2clima-byte/maestro confermata (Installation ID 129338879).
