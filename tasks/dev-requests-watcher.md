# MAESTRO watcher — `nexo_dev_requests`

Questa nota documenta come MAESTRO può consumare le richieste di sviluppo
scritte da Alberto direttamente dalla PWA di IRIS. È il meccanismo che
trasforma la PWA in **un'interfaccia di sviluppo live**: Alberto clicca
"🛠️ Dev" accanto a un'email (o "🛠️ Nuova richiesta dev" in header),
scrive cosa vuole, preme invio → MAESTRO fa partire il lavoro.

## Flow end-to-end

1. **Utente** apre la PWA `https://nexo-hub-15f2d.web.app`, vede un'email,
   ha un'idea. Clicca il bottone "🛠️ Dev" sulla card (o "🛠️ Nuova
   richiesta dev" nell'header per idee slegate da una email specifica).
2. La PWA scrive un documento nella collection Firestore
   `nexo_dev_requests` con shape:
   ```json
   {
     "description": "testo in linguaggio naturale",
     "status": "pending",
     "emailRef": {
       "id": "...", "sender": "...", "subject": "...", "category": "..."
     },
     "createdAt": <serverTimestamp>
   }
   ```
   `emailRef` è `null` per richieste generali.
3. **MAESTRO** pollando la collection (cron ogni N minuti, o trigger
   Firestore) vede i documenti con `status == "pending"`.
4. Per ciascun doc:
   - Lancia `python3 projects/iris/scripts/export_dev_requests.py`
     (idempotente): converte ogni request pending in un file
     `tasks/iris-dev-{timestamp}-{shortid}-{slug}.md`, e aggiorna lo status
     Firestore a `in_progress` aggiungendo `exportedAt` + `taskFile`.
   - MAESTRO raccoglie i nuovi file `tasks/iris-dev-*.md` come qualunque
     altro task e li passa a Claude Code (flow standard del repo
     `maestro-bridge`).
5. Quando Claude Code completa il task, chi ha eseguito deve **chiudere la
   request** scrivendo `status: "completed"` su Firestore
   (istruzioni embedded nel file task generato).

## Perché questo design

- **Write-only dal client**: le rules di `nexo_dev_requests` permettono
  alla PWA solo `create` (con validazione dimensionale); `update`/`delete`
  richiedono Admin SDK. Così nessuno dal client può cambiare lo status o
  cancellare richieste di altri.
- **Status machine minimale**: `pending → in_progress → completed` (o
  `rejected` se non fattibile). Ogni transizione è attribuibile (chi
  l'ha esportata, quando, in quale file).
- **Idempotenza**: lo script `export_dev_requests.py` usa un index
  basato sullo shortid del doc → lanciarlo due volte di fila non genera
  duplicati.
- **Backward compat**: lo script legge sia la shape corrente
  (`description` + `emailRef`) sia quella legacy (`request` + campi flat
  `emailId/emailSender/emailSubject/emailCategory`) introdotta
  temporaneamente dal primo commit del sistema.

## Comandi utili

```bash
# Vedere quante request sono in coda
python3 -c "
import firebase_admin
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
firebase_admin.initialize_app(options={'projectId':'nexo-hub-15f2d'})
db = firestore.client()
for s in ('pending','in_progress','completed','rejected'):
    n = len(list(db.collection('nexo_dev_requests').where(filter=FieldFilter('status','==',s)).stream()))
    print(f'{s}: {n}')
"

# Preview senza scrivere
cd projects/iris && python3 scripts/export_dev_requests.py --dry-run

# Esporta + marca in_progress
cd projects/iris && python3 scripts/export_dev_requests.py
```

## TODO v0.2

- Triggering via Cloud Function `onCreate` su `nexo_dev_requests` invece
  di polling (richiede Blaze).
- Notifica push a MAESTRO quando arriva una nuova request (Slack/email).
- Richiesta auth sulla collection (no più writes anonime).
- UI per cambiare lo status da admin (oggi solo Admin SDK da CLI).
