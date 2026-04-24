MEMO deve avere i dati COSMINA sempre aggiornati in tempo reale. Due fasi.

## Fase 1 — Scansione iniziale completa

Script: scripts/memo_initial_sync.py

1. Connettiti a garbymobile-f89ac
2. Leggi TUTTE le collection principali e salva in nexo-hub memo_cache/:
   - crm_clienti → memo_cache/clienti/{id}
   - cosmina_impianti → memo_cache/impianti/{id}
   - bacheca_cards → memo_cache/interventi/{id}
   - cosmina_config/tecnici_acg → memo_cache/tecnici/{id}
   - La collection rubrica contatti interni → memo_cache/contatti/{id}
3. Per ogni documento: copia i campi principali (no blob/allegati pesanti)
4. Aggiungi campo _syncedAt: timestamp
5. Stampa: "Sincronizzati X clienti, Y impianti, Z interventi, W contatti"

## Fase 2 — Trigger su variazioni (Cloud Functions)

Crea Cloud Functions su progetto garbymobile-f89ac (NON nexo-hub):

memoSyncClienti:
- Trigger: onDocumentWritten su crm_clienti/{docId}
- Azione: scrivi/aggiorna/cancella il documento corrispondente in nexo-hub memo_cache/clienti/{docId}
- Nessun LLM, solo copia campi

memoSyncImpianti:
- Trigger: onDocumentWritten su cosmina_impianti/{docId}
- Azione: scrivi in nexo-hub memo_cache/impianti/{docId}

memoSyncInterventi:
- Trigger: onDocumentWritten su bacheca_cards/{docId}
- Azione: scrivi in nexo-hub memo_cache/interventi/{docId}

memoSyncContatti:
- Trigger: onDocumentWritten sulla collection contatti interni/{docId}
- Azione: scrivi in nexo-hub memo_cache/contatti/{docId}

Per scrivere cross-project (da garbymobile a nexo-hub):
- Le Cloud Functions su garbymobile devono inizializzare una seconda app Firebase con projectId nexo-hub-15f2d
- Usano le credenziali di default (service account garbymobile deve avere permessi su nexo-hub)

Se i permessi cross-project non funzionano:
- Alternativa: le Cloud Functions su garbymobile scrivono su una collection locale garbymobile memo_sync_queue
- Una Cloud Function su nexo-hub (schedulata ogni 1 minuto) legge la coda e aggiorna memo_cache

## Fase 3 — Handler MEMO aggiornato

In handlers/memo.js:
- Tutte le query leggono da memo_cache (nexo-hub) invece di chiamare garbymobile direttamente
- Risposte istantanee, nessuna latenza cross-project
- Se un documento non è in cache (raro): fallback a query live su garbymobile

## Fase 4 — Permessi

Verifica/configura:
gcloud projects add-iam-policy-binding nexo-hub-15f2d \
  --member=serviceAccount:garbymobile-f89ac@appspot.gserviceaccount.com \
  --role=roles/datastore.user

## Deploy

- Deploy functions su garbymobile-f89ac (i trigger)
- Deploy functions su nexo-hub-15f2d (handler MEMO aggiornato)
- Esegui scansione iniziale

## Test

- Modifica un cliente in COSMINA (via console Firebase)
- Verifica che memo_cache si aggiorni entro 5 secondi
- NEXUS: "dimmi tutto su [cliente modificato]" — deve avere i dati aggiornati

Committa con "feat(memo): sync realtime COSMINA → nexo-hub"
