Crea un sistema di stato in tempo reale per Claude Code visibile a Claude Chat.

## 1. MAESTRO — Scrivi stato su Firestore

In maestro.mjs, ad ogni fase del ciclo, scrivi su Firestore nexo-hub-15f2d collection nexo_code_status documento "current":

```javascript
const admin = require('firebase-admin');
// Inizializza Firebase se non già fatto
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'nexo-hub-15f2d' });
}
const db = admin.firestore();

async function updateStatus(fase, dettagli) {
  await db.collection('nexo_code_status').doc('current').set({
    fase: fase,           // "polling", "found_task", "sending_to_code", "waiting_result", "pushing_result", "idle"
    task: dettagli.task || null,
    dettagli: dettagli.msg || null,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    uptime: process.uptime()
  }, { merge: true });
}
```

Chiama updateStatus nei punti chiave di maestro.mjs:
- Prima del git pull: updateStatus("polling", {msg: "git pull in corso"})
- Quando trova un task: updateStatus("found_task", {task: taskName, msg: "task trovato"})
- Quando manda a Claude Code: updateStatus("sending_to_code", {task: taskName, msg: "invio a Claude Code"})
- Mentre aspetta: updateStatus("waiting_result", {task: taskName, msg: "Claude Code sta lavorando"})
- Quando pusha il risultato: updateStatus("pushing_result", {task: taskName, msg: "push risultato"})
- Quando non trova task: updateStatus("idle", {msg: "nessun task in coda"})

Aggiungi firebase-admin a package.json se non c'è già:
npm install firebase-admin --save

## 2. Cloud Function — Endpoint lettura stato

In handlers/shared.js o in index.js, aggiungi:

```javascript
// GET /codeStatus — ritorna lo stato di Claude Code
exports.codeStatus = onRequest({ cors: true, region: 'europe-west1' }, async (req, res) => {
  const db = getFirestore();
  const doc = await db.collection('nexo_code_status').doc('current').get();
  if (!doc.exists) {
    res.json({ fase: 'unknown', msg: 'nessuno stato disponibile' });
  } else {
    res.json(doc.data());
  }
});
```

Esporta in index.js:
```javascript
exports.codeStatus = shared.codeStatus; // o come preferisci
```

NON mettere auth su questo endpoint — deve essere pubblico per Claude Chat.

## 3. Firestore rules

Aggiungi:
```
match /nexo_code_status/{doc} { allow read: if true; allow write: if true; }
```

## 4. Deploy

- npm install firebase-admin nella root del repo (per maestro.mjs)
- firebase deploy --only functions --project nexo-hub-15f2d
- firebase deploy --only firestore:rules --project nexo-hub-15f2d

## 5. Test

- Avvia maestro.mjs
- Aspetta 30 secondi
- curl https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/codeStatus
- Deve ritornare JSON con fase, task, timestamp

## 6. Committa con "feat(maestro): stato Claude Code su Firestore in tempo reale"
