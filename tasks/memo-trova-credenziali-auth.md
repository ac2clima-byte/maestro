MEMO deve trovare le credenziali per il login della PWA NEXO.

1. Leggi context/memo-firestore-garbymobile.md — cerca la sezione auth/utenti
2. Leggi context/memo-acg-suite-mappa.md — cerca come funziona il login della Suite
3. Cerca nei file del progetto:
   grep -r "signIn\|EMAIL\|PASSWORD\|AUTH_EMAIL\|TEST_USER" ~/maestro-bridge/ ~/acg_suite/ /mnt/c/HERMES/ --include="*.env" --include="*.env.*" 2>/dev/null
4. Cerca nella configurazione Firebase Auth:
   firebase auth:list-users --project garbymobile-f89ac 2>/dev/null | head -10
5. Leggi il codice auth della PWA per capire quale email/password usa:
   grep -A5 "signInWithEmailAndPassword\|authEmail\|authPassword" projects/nexo-pwa/public/js/app.js 2>/dev/null

6. Una volta trovate le credenziali, salvale come variabili environment e rilancia l'audit NEXUS completo con i 15 test conversazionali

7. Committa con "feat(memo): credenziali auth trovate + audit E2E"
