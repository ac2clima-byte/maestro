Il link al PDF del preventivo dà errore 403 Permission denied. Firebase Storage non ha permessi di lettura pubblica.

Fix:
1. Aggiorna le Storage rules di garbymobile-f89ac per permettere la lettura dei PDF preventivi:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /documents/{allPaths=**} {
      allow read: if true;  // PDF preventivi leggibili senza auth
      allow write: if request.auth != null;
    }
    // ... altre regole esistenti
  }
}
```

2. Oppure, se non vuoi rendere tutto pubblico, genera URL firmati (signed URLs) con scadenza:
   - Nel codice preventivo, dopo il caricamento del PDF, genera un signed URL con scadenza 30 giorni
   - Usa: bucket.file(path).getSignedUrl({ action: 'read', expires: Date.now() + 30*24*60*60*1000 })

3. Testa: apri il link del preventivo PRE-001/2026 in un browser → deve scaricare il PDF senza errore

Deploy storage rules.
Email report.
Committa con "fix(storage): permessi lettura PDF preventivi"
