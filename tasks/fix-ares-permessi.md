La pagina ARES nella PWA mostra "Missing or insufficient permissions".

Il problema è che la PWA legge direttamente da Firestore ma le rules bloccano la lettura. ARES legge da COSMINA (garbymobile-f89ac) tramite la Cloud Function, non dal frontend.

FIX:

1. Verifica: la pagina ARES nella PWA sta chiamando Firestore direttamente dal browser o passa dal nexusRouter?

2. Se chiama Firestore direttamente: cambia per chiamare il nexusRouter (come fa NEXUS Chat). La PWA non deve mai accedere a garbymobile-f89ac direttamente.

3. Se il problema è sulle collection ARES di nexo-hub (ares_interventi, ares_assegnazioni), aggiungi le rules in firestore.rules:
   match /ares_interventi/{doc} { allow read: if true; allow write: if false; }
   match /ares_assegnazioni/{doc} { allow read: if true; allow write: if false; }

4. Deploy rules: cd projects/iris && firebase deploy --only firestore:rules

5. Verifica che la pagina ARES funzioni

6. Committa con "fix(ares): permessi Firestore per PWA"
