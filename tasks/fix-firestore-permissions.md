Le collection nexo_lavagna e pharo_alerts non sono leggibili dalla PWA. Errore: "Missing or insufficient permissions."

Aggiorna projects/iris/firestore.rules (o il file firestore.rules del progetto nexo-hub-15f2d) per permettere la lettura di queste collection:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // IRIS collections - già funzionanti
    match /iris_emails/{doc} { allow read: if true; allow write: if false; }
    match /iris_threads/{doc} { allow read: if true; allow write: if false; }
    match /iris_corrections/{doc} { allow read, write: if true; }
    match /iris_sender_profiles/{doc} { allow read: if true; allow write: if false; }
    match /iris_rules/{doc} { allow read, write: if true; }
    
    // Lavagna - lettura per PWA, scrittura solo da backend
    match /nexo_lavagna/{doc} { allow read: if true; allow write: if true; }
    
    // PHARO
    match /pharo_alerts/{doc} { allow read: if true; allow write: if true; }
    match /pharo_heartbeat/{doc} { allow read: if true; allow write: if true; }
    
    // Dev requests
    match /nexo_dev_requests/{doc} { allow read, write: if true; }
    
    // Budget
    match /nexo_budget/{doc=**} { allow read: if true; allow write: if true; }
    
    // Logs
    match /nexo_logs/{doc} { allow read: if true; allow write: if true; }
  }
}

Deploya le rules: cd projects/iris && firebase deploy --only firestore:rules

Poi ricarica la PWA e verifica che Lavagna e PHARO funzionino.
Committa con "fix: Firestore rules per Lavagna e PHARO"
