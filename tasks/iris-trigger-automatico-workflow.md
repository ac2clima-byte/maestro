IRIS deve triggerare automaticamente i workflow quando riconosce un intent.

Oggi: email arriva → IRIS classifica → aspetta che Alberto chieda.
Domani: email arriva → IRIS classifica + riconosce intent → avvia workflow automaticamente → notifica Alberto con il risultato pronto.

## Implementazione

1. Dopo la classificazione di ogni email (nel irisRuleEngine o nella pipeline), se l'email ha un intent riconosciuto:

   - intent == "preparare_preventivo" → avvia workflow preventivo automaticamente:
     a. Scrivi sulla Lavagna: to="orchestrator", tipo="preparare_preventivo", payload con dati email
     b. L'Orchestratore (orchestratorLavagnaListener) riceve e chiama runPreventivoWorkflow
     c. Il preventivo viene generato e salvato in calliope_bozze
     d. Push notification ad Alberto: "📄 Preventivo De Amicis pronto per revisione"
     e. Quando Alberto apre NEXUS Chat, vede il preventivo già pronto con "Approva / Modifica / Rifiuta"

   - intent == "registrare_fattura" → scrivi Lavagna per CHARTA
   - intent == "aprire_intervento_urgente" → scrivi Lavagna per ARES + ECHO WA urgente
   - intent == "sollecitare_pagamento" → scrivi Lavagna per CALLIOPE (prepara sollecito)
   - intent == "gestire_pec" → scrivi Lavagna per DIKEA

2. Aggiorna handlers/iris.js o la Cloud Function irisRuleEngine:
   - Dopo la classificazione, controlla il campo intent
   - Se intent != "nessuna_azione" e intent != null:
     → Scrivi messaggio sulla Lavagna per l'Orchestratore
     → Log: "IRIS ha triggerato workflow [intent] per email [id]"

3. Aggiorna handlers/orchestrator.js:
   - orchestratorLavagnaListener deve gestire tipo="preparare_preventivo":
     → Leggi i dati dall'email (dati_estratti)
     → Chiama runPreventivoWorkflow con i dati
   - Per gli altri intent: logga "workflow [intent] non ancora implementato"

4. Push notification dopo il workflow:
   - Usa sendPushNotification da shared.js
   - Titolo: "📄 Preventivo pronto"
   - Body: "Preventivo De Amicis intestato a 3i efficientamento (€841,80). Apri NEXUS per approvare."
   - Click → apre NEXUS Chat

5. NEXUS Chat: quando Alberto apre dopo la notifica:
   - Mostra automaticamente l'ultimo preventivo in attesa di approvazione
   - "Ho preparato questo preventivo basandomi sull'email di Torriglia. Approvi?"

6. Testa il flusso completo:
   - Crea un documento test in iris_emails che simula una nuova email con intent preparare_preventivo
   - Verifica che il workflow parta automaticamente
   - Verifica che la bozza venga creata in calliope_bozze
   - Verifica la push notification (o almeno il log)
   - Screenshot di NEXUS Chat con il preventivo pronto

7. Deploy functions
8. Committa con "feat(iris): trigger automatico workflow su intent riconosciuto"
