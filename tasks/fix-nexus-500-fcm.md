CRITICO: nexusRouter ritorna 500 e FCM fallisce con 401. NEXUS Chat è completamente rotta.

## 1. Fix nexusRouter 500 (PRIORITÀ ASSOLUTA)

1. Controlla i log della Cloud Function:
   firebase functions:log --only nexusRouter --project nexo-hub-15f2d | tail -30

2. Probabilmente è un errore di import dopo il refactoring. Verifica:
   - Tutti gli import in index.js sono corretti
   - Tutti i file in handlers/ sono sintatticamente validi
   - Nessun modulo mancante in package.json

3. Testa in locale se possibile:
   cd projects/iris/functions && node -e "import('./index.js')" 2>&1

4. Fix l'errore e rideploya:
   cd projects/iris && firebase deploy --only functions

5. Testa: chiama nexusRouter con curl o Playwright e verifica 200

## 2. Fix FCM 401

L'errore dice "missing required authentication credential". Probabilmente:
- La VAPID key non è configurata
- Il Firebase config nella PWA non ha la messagingSenderId corretta

1. Nella console Firebase (nexo-hub-15f2d) → Cloud Messaging → prendi la Server Key e la VAPID key
2. Nella PWA, verifica che il Firebase config abbia:
   - messagingSenderId corretto
   - La VAPID key nel getToken({ vapidKey: "..." })
3. Se FCM non è abilitato nel progetto, abilitalo dalla console Firebase → Cloud Messaging

4. Se non riesci a fixare FCM subito, DISABILITA le push notification nella PWA (commenta il codice FCM) così almeno non genera errori. Le notifiche le attiviamo dopo, il 500 sul router è più urgente.

## 3. Verifica finale

- Apri https://nexo-hub-15f2d.web.app
- Apri NEXUS Chat
- Scrivi "ciao"
- Deve rispondere (non 500)
- Screenshot

Deploy functions + hosting.
Committa con "fix: nexusRouter 500 + FCM 401"
