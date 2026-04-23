Implementa il sistema di intent recognition + notifiche push + addestramento via chat. Fai tutto in sequenza.

## 1. PWA Push Notifications con Firebase Cloud Messaging

In projects/nexo-pwa/public/index.html:
1. Aggiungi Firebase Cloud Messaging (FCM)
2. Chiedi il permesso notifiche all'utente dopo il login
3. Salva il token FCM in Firestore nexo_config/fcm_tokens/{userId}
4. Crea Service Worker per ricevere notifiche in background: projects/nexo-pwa/public/firebase-messaging-sw.js

In handlers/shared.js:
5. Crea funzione sendPushNotification(title, body, link) che:
   - Legge il token FCM da nexo_config/fcm_tokens
   - Manda la notifica via FCM admin SDK
   - Link apre la PWA nella chat NEXUS

Testa: manda una push notification di test. Verifica che appaia sul browser.
Committa con "feat(nexo): push notifications FCM"

## 2. IRIS Intent Recognition — Prompt avanzato

Aggiorna il prompt del classificatore IRIS (in handlers/iris.js o nel prompt file).

Il prompt deve chiedere a Haiku di rispondere in JSON con:
```json
{
  "categoria": "FATTURA_FORNITORE",
  "intent": "preparare_preventivo",
  "dati_estratti": {
    "persone": [{"nome": "Davide Torriglia", "ruolo": "referente", "azienda": "3i efficientamento energetico"}],
    "aziende": [{"nome": "3i efficientamento energetico S.r.l.", "piva": "02486680065"}],
    "condomini": ["De Amicis"],
    "importi": [],
    "date": [],
    "riferimenti_documenti": ["offerta verifica riscaldamento"]
  },
  "contesto_thread": "Alberto ha chiesto intestazione per offerta, Torriglia ha risposto con ragione sociale e P.IVA",
  "prossimo_passo": "Preparare preventivo verifica riscaldamento intestato a 3i efficientamento energetico per Condominio De Amicis"
}
```

Lista intent predefiniti:
- preparare_preventivo
- registrare_fattura
- aprire_intervento_urgente
- aprire_intervento_ordinario
- rispondere_a_richiesta
- registrare_incasso
- gestire_pec
- sollecitare_pagamento
- archiviare (spam/newsletter)
- nessuna_azione

Il prompt deve anche leggere il THREAD COMPLETO (email quotata sotto) per capire il contesto.

Aggiorna il tipo IrisEmailDoc con i nuovi campi: intent, dati_estratti, contesto_thread, prossimo_passo.
Committa con "feat(iris): intent recognition avanzato"

## 3. Addestramento Pattern via NEXUS Chat

In handlers/nexus.js aggiungi il comando "analizza":

Quando Alberto scrive "analizza l'ultima mail di [nome]" o "analizza questa email":
1. Cerca l'ultima email del mittente in iris_emails
2. Se ha già intent e dati_estratti: mostrali in chat formattati
3. Se non li ha: chiama Haiku con il prompt avanzato e salva il risultato
4. Mostra ad Alberto:
   - Cosa ha capito (intent, dati estratti, contesto)
   - Cosa farebbe (prossimo passo)
   - Chiedi conferma: "È corretto?"
5. Alberto risponde:
   - "sì" → salva il pattern in iris_patterns con confidenza 0.9
   - "sì ma [modifica]" → applica la modifica, salva pattern aggiornato
   - "no, l'intent è [altro]" → correggi e salva in iris_corrections + iris_patterns
6. Dopo 3+ conferme dello stesso pattern → diventa regola automatica (confidenza 1.0)

Collection Firestore: iris_patterns
Schema:
```json
{
  "id": "pattern_001",
  "trigger_description": "risposta con ragione sociale e P.IVA a richiesta intestazione",
  "intent": "preparare_preventivo",
  "workflow": "preventivo",
  "confidenza": 0.9,
  "volte_confermato": 1,
  "volte_rifiutato": 0,
  "ultimo_uso": "2026-04-23",
  "creato_da": "alberto",
  "esempio_email_ids": ["email_xyz"]
}
```

Aggiungi Firestore rules per iris_patterns (read: true, write: false — solo Admin SDK).
Committa con "feat(nexus): addestramento pattern via chat"

## 4. Workflow Preventivo nell'Orchestratore

In handlers/orchestrator.js aggiungi workflow "preventivo":

Trigger: intent == "preparare_preventivo" nella Lavagna

Step 1 — MEMO: cerca il condominio nel CRM, ritorna dati (indirizzo, impianti)
Step 2 — MEMO: cerca l'azienda committente (se non nel CRM, cerca P.IVA in rete con web search o salva come nuovo contatto)
Step 3 — CALLIOPE: prepara bozza preventivo con:
  - Intestazione: dati azienda committente
  - Oggetto: dal campo intent
  - Condominio: dati dal CRM
  - Template: preventivo standard ACG
Step 4 — Notifica Alberto via push: "Preventivo De Amicis pronto per revisione"
Step 5 — Attendi risposta in NEXUS Chat:
  - "approva" o "ok invia" → Step 6
  - "modifica: [istruzioni]" → torna a Step 3 con istruzioni
  - "rifiuta" → chiudi workflow
Step 6 — ECHO: manda email con preventivo a destinatario + CC partecipanti thread originale

Committa con "feat(orchestrator): workflow preventivo"

## 5. Deploy + Test

- Deploy functions + hosting + rules
- Testa push notification
- Testa "analizza l'ultima mail di Torriglia" in NEXUS Chat
- Testa workflow preventivo end-to-end
- Screenshot + report
- Committa con "test(nexo): intent recognition + workflow preventivo"
