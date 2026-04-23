Aggiungi il bottone "Archivia" nella PWA IRIS per ogni email.

## Logica

Quando Alberto clicca "Archivia" su un'email:
1. Prendi il nome del mittente (es. "Davide Torriglia" → cartella "Torriglia Davide")
2. Su Exchange (EWS), cerca la cartella con quel nome sotto la Inbox (o sotto una cartella "Archivio")
3. Se la cartella NON esiste → creala
4. Sposta l'email nella cartella del mittente
5. Aggiorna iris_emails in Firestore: stato = "archived", archiviata_il = now, cartella = nome cartella
6. Nella PWA l'email scompare dalla lista principale (o appare con badge "archiviata" grigio)

## Implementazione

### Cloud Function: irisArchiveEmail (HTTP POST)

In handlers/iris.js aggiungi:

```
POST /archiveEmail
Body: { emailId: "xxx", messageId: "exchange_message_id" }

1. Leggi l'email da iris_emails per avere sender e messageId Exchange
2. Connettiti a EWS con exchangelib (o ews-javascript-api se Node)
   - Se EWS non è raggiungibile da Cloud Functions (server on-premise):
     - Opzione A: crea un endpoint proxy su Hetzner (come il poller)
     - Opzione B: la Cloud Function salva la richiesta in Firestore (iris_archive_queue) e il poller su Hetzner/PC la esegue
3. Cerca/crea cartella con nome mittente
4. Sposta l'email
5. Aggiorna Firestore
6. Ritorna { success: true, folder: "Torriglia Davide" }
```

### PWA

Per ogni email nella lista IRIS:
- Aggiungi bottone "📁 Archivia" (piccolo, a destra nella riga email)
- Click → chiama Cloud Function → feedback "Archiviata in cartella Torriglia Davide ✅"
- L'email diventa grigia o scompare dalla vista principale
- Aggiungi filtro "Mostra archiviate" per rivederle

### Formato nome cartella

- Mittente "Davide Torriglia <davide.torriglia@gruppo3i.it>" → cartella "Torriglia Davide"
- Mittente "Massimo Colla - Guazzotti Energia SRL" → cartella "Colla Massimo"
- Mittente sconosciuto o email generica → cartella con dominio: "gruppo3i.it"
- Cognome prima, Nome dopo (stile italiano)

### Nota EWS on-premise

Se EWS non è raggiungibile da GCP (come per il poller), usa il pattern coda:
1. La Cloud Function scrive in iris_archive_queue: { emailId, messageId, folder, status: "pending" }
2. Lo script Hetzner (iris_hetzner_poller.py) controlla anche la coda e esegue le archiviazioni
3. Dopo l'archiviazione aggiorna status = "done"

Questo pattern funziona per TUTTE le operazioni EWS future (invio email, spostamento, ecc.)

Deploy functions + hosting.
Committa con "feat(iris): archiviazione email in cartella per mittente"
