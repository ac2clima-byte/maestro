# Task: NEXO sotto login ACG Suite

NEXO deve essere protetto dal login di ACG Suite, come COSMINA.

## Contesto
- La landing page acgsuite.web.app ha un sistema SSO che autentica gli utenti
- COSMINA usa Firebase Auth del progetto garbymobile-f89ac
- NEXO attualmente è su nexo-hub-15f2d e non ha login (la card nella landing ha flag noSSO: true)
- Serve che NEXO usi lo STESSO sistema di auth della Suite

## Cosa fare

1. Leggi come funziona il login nella landing page ACG Suite:
   - Analizza ~/acg_suite/COSMINA/firebase/landing/index.html
   - Cerca come la landing autentica e come passa il token alle app (COSMINA, DOC, GRAPH, ecc.)
   - Capire: l'auth è su garbymobile-f89ac? Usa signInWithEmailAndPassword? Google SSO? Custom token?

2. Replica lo stesso meccanismo nella PWA NEXO:
   - Se la Suite usa Firebase Auth di garbymobile-f89ac:
     a. Configura la PWA NEXO per usare Firebase Auth di garbymobile-f89ac (non nexo-hub-15f2d)
     b. Aggiungi schermata login identica a COSMINA
     c. Dopo login, mostra la dashboard NEXO
     d. Se non loggato, redirect alla landing acgsuite.web.app
   - Se la Suite usa un token passato via URL:
     a. Leggi il token dall'URL
     b. Valida il token
     c. Se valido, mostra NEXO
     d. Se non valido, redirect alla landing

3. Rimuovi il flag noSSO: true dalla card NEXO nella landing page ACG Suite

4. Proteggi anche la Cloud Function nexusRouter:
   - Verifica che il token Firebase Auth sia passato nell'header Authorization
   - Se non autenticato, ritorna 401

5. Proteggi NEXUS Chat:
   - La PWA deve mandare il token Firebase Auth in ogni chiamata al nexusRouter
   - Il nexusRouter verifica il token prima di rispondere

6. Aggiorna Firestore rules per richiedere auth dove necessario

7. Testa:
   - Apri nexo-hub-15f2d.web.app senza login → deve redirectare alla landing o mostrare login
   - Login dalla landing → click su NEXO → deve aprire NEXO autenticato
   - NEXUS Chat funziona dopo login

8. Committa e deploya tutto
