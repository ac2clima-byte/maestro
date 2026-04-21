# Sprint 1 — Sicurezza e fondamenta

## Task 1.1: Password EWS — Ruotare
Alberto deve cambiare la password dell'account alberto.contardi@acgclimaservice.com nel server Exchange.
Dopo il cambio, aggiornare:
- /mnt/c/HERMES/.env (OUTLOOK_PASSWORD)
- ~/maestro-bridge/projects/iris/.env (EWS_PASSWORD)
NON è un task per Claude Code — è manuale.

## Task 1.2: API key Anthropic in Secret Manager
Verifica che il secret ANTHROPIC_API_KEY esista in Firebase Secret Manager per il progetto nexo-hub-15f2d.

1. Controlla: firebase functions:secrets:get ANTHROPIC_API_KEY --project nexo-hub-15f2d
2. Se non esiste, crealo: firebase functions:secrets:set ANTHROPIC_API_KEY --project nexo-hub-15f2d
   - Inserisci la nuova API key (quella in ~/maestro-bridge/projects/iris/.env)
3. Verifica che le Cloud Functions lo usino: grep "defineSecret" projects/iris/functions/index.js
4. Rideploya le functions: cd projects/iris && firebase deploy --only functions
5. Testa: chiama nexusRouter e verifica che risponda (non errore "secret not found")
6. Committa con "fix: API key in Secret Manager verificata"

## Task 1.3: MEMO scansione COSMINA Firestore completa
Scansione completa del Firestore di garbymobile-f89ac (COSMINA/ACG).

1. Connettiti a Firestore garbymobile-f89ac
2. Lista TUTTE le collection con conteggio documenti
3. Per ogni collection: leggi 2 documenti, mappa schema campi
4. Focus su:
   - crm_clienti (o cosmina_clienti): struttura clienti
   - cosmina_impianti: struttura impianti, campo prossima_scadenza
   - cosmina_impianti_cit: dati CURIT
   - cosmina_interventi_pianificati: struttura interventi
   - cosmina_config/tecnici_acg: struttura tecnici
   - Rubrica contatti interni: quale collection? come si chiama?
   - magazzino_giacenze / magazzino_movimenti / magazzino_listini: esistono?
   - cosmina_campagne: esiste?
   - audit_log: esiste?

5. Salva in context/memo-firestore-garbymobile.md con:
   - Lista completa collection con conteggio
   - Schema per ogni collection
   - Documento esempio per ogni collection
   - Relazioni tra collection

6. Salva in context/memo-acg-suite-mappa.md:
   - Lista app della Suite con URL e descrizione
   - Per ogni app: quali collection usa, quali Cloud Functions

7. Salva in context/memo-cloud-functions.md:
   - firebase functions:list --project garbymobile-f89ac
   - Per ogni funzione: trigger, regione, descrizione

8. Committa con "feat(memo): scansione completa COSMINA Firestore + Cloud Functions"

## Task 1.4: MEMO dossier cliente da COSMINA
Dopo la scansione (task 1.3), aggiorna l'handler MEMO nel nexusRouter.

1. Usa i nomi delle collection trovati in task 1.3
2. Quando l'utente chiede "dimmi tutto su [nome]":
   - Cerca in crm_clienti/cosmina_clienti per nome
   - Cerca in cosmina_impianti per condominio/indirizzo
   - Cerca in cosmina_interventi_pianificati per interventi collegati
   - Cerca in iris_emails per email correlate
3. Ritorna dossier completo con tutti i dati trovati
4. Testa con Playwright: "dimmi tutto su La Bussola", "dimmi tutto su Kristal"
5. Screenshot + analisi testuale
6. Rideploya functions
7. Committa con "feat(memo): dossier reale da COSMINA"
