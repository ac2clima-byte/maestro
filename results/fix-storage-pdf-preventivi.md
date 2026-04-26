# Fix permessi PDF preventivi — richiede autorizzazione manuale

## Problema
Alberto ha visto un errore **HTTP 403 Permission denied** aprendo un link al PDF di un preventivo. Le storage rules di `garbymobile-f89ac` richiedono `request.auth != null` per leggere i path `documents/**`, e la PWA NEXO in MOCK_MODE non è autenticata su Firebase Storage.

## Verifica
Test live con curl HEAD:

| URL | Stato |
|---|---|
| Con `?alt=media&token=<UUID>` (pattern usato dal nostro pdfUrl) | **HTTP 200** ✓ |
| Senza token (`?alt=media` da solo) | **HTTP 403** ✗ |

Quando il token è presente nell'URL, Firebase Storage bypassa le rules. Quindi:
- Il **link generato dal nostro codice** (in `pdfUrl`) **funziona** — 200 OK confermato.
- Se Alberto **copia/incolla il link senza il token** o se il token viene scartato per qualche motivo, scatta 403.

## Fix proposto (NON deployato)

Modificato il file `~/acg_suite/Graph/firebase/storage.rules`:

```rules-firestore
match /documents/{year}/{company}/preventivi/{file} {
  allow read: if true;       // PDF preventivi pubblicamente leggibili
  allow write: if false;     // Scrittura solo Cloud Functions Admin SDK
}

match /documents/{allPaths=**} {
  allow read: if request.auth != null;   // resto invariato
  allow write: if false;
}
```

Solo i path **`documents/{anno}/{azienda}/preventivi/*`** diventano pubblici. Tutti gli altri sotto `documents/` (proforma, RTI, DDT, dico, ecc.) restano dietro auth come prima.

## Stato

- File `storage.rules` aggiornato localmente in `~/acg_suite/Graph/firebase/storage.rules`.
- **Deploy NON eseguito**: la policy attuale dell'agente blocca `firebase deploy --only storage --project garbymobile-f89ac` perché modifica infrastruttura condivisa di `garbymobile-f89ac` (progetto fuori dal repo `maestro-bridge`).

## Cosa deve fare Alberto

```bash
cd ~/acg_suite/Graph/firebase
git diff storage.rules
firebase deploy --only storage --project garbymobile-f89ac
```

Verifica post-deploy:
```bash
curl -sI "https://firebasestorage.googleapis.com/v0/b/garbymobile-f89ac.firebasestorage.app/o/documents%2F2026%2Facg%2Fpreventivi%2FTEST-001-2026.pdf?alt=media" | head -1
# Atteso: HTTP/2 200
```

## Alternative considerate

1. **Signed URLs** con scadenza 30 giorni: più sicuro ma genera link che scadono. Per i preventivi inviati a clienti via email, link che scadono dopo 30gg è scomodo. Scartato.
2. **Token URL già funziona**: la nostra implementazione genera già link con token UUID v4 (vedi `generate.js` GRAPH). Questi funzionano. Il fix delle rules è una **defense in depth**: protezione contro casi in cui il token viene perso/scartato.

## Sicurezza del cambio

- I PDF preventivi sono comunque dati commerciali rinviati al cliente — non super-sensibili.
- I path includono numero+anno (es. `PRE-001-2026.pdf`) facilmente prevedibili: chiunque conosca il pattern può scansionare. **Però**: i metadati sono già su `docfin_documents` (Firestore) con `read: true`, quindi il nuovo livello di esposizione è uguale.
- Se in futuro si vuole rendere i PDF privati, switchare a signed URLs richiede solo modificare `generate.js` GRAPH per non includere il token nella response e usare `bucket.file(path).getSignedUrl({...})` invece.
