Crea l'infrastruttura della Lavagna di NEXO — il canale di comunicazione tra Colleghi.

CONTESTO:
I Colleghi di NEXO (IRIS, EFESTO, ESTIA, ecc.) non agiscono mai sul dominio di un altro Collega. Quando IRIS vede una richiesta di intervento, non apre l'intervento in COSMINA — scrive un messaggio sulla Lavagna destinato a EFESTO. Ogni Collega legge dalla Lavagna i messaggi diretti a sé.

TASK:

1. Crea projects/nexo-core/lavagna/ con:

   - projects/nexo-core/lavagna/types.ts con:
     ```
     LavagnaMessage {
       id: string (auto-generated)
       from: string (nome collega mittente: "iris", "efesto", "estia", ecc.)
       to: string (nome collega destinatario, o "orchestrator" se non sa a chi mandare)
       type: string (tipo messaggio: "richiesta_intervento", "alert_urgente", "richiesta_info", "task_completato", ecc.)
       payload: Record<string, any> (dati specifici del messaggio)
       status: "pending" | "picked_up" | "completed" | "failed"
       priority: "low" | "normal" | "high" | "critical"
       sourceEmailId?: string (riferimento all'email originale se il messaggio nasce da IRIS)
       pickedUpAt?: timestamp
       completedAt?: timestamp
       createdAt: timestamp
       updatedAt: timestamp
     }
     ```

   - projects/nexo-core/lavagna/Lavagna.ts — classe che wrappa Firestore:
     - async post(message): scrive un messaggio sulla lavagna
     - async pickUp(messageId): segna come "picked_up" (il Collega lo sta gestendo)
     - async complete(messageId, result): segna come "completed"
     - async fail(messageId, reason): segna come "failed"
     - async getPending(colleageName): legge i messaggi pending per un Collega
     - async getHistory(filters): legge storico con filtri (from, to, type, date range)
     - Collection Firestore: nexo_lavagna
     - Firebase project: nexo-hub-15f2d

   - projects/nexo-core/lavagna/index.ts — re-export

2. Crea projects/nexo-core/lavagna/tests/lavagna.test.ts con test mock di Firestore

3. Aggiorna projects/iris/src/classifier/Classifier.ts (o crea un nuovo modulo projects/iris/src/actions/PostToLavagna.ts):
   - Dopo la classificazione, se la categoria è RICHIESTA_INTERVENTO o GUASTO_URGENTE, IRIS scrive automaticamente sulla Lavagna un messaggio destinato a "efesto" con i dati estratti
   - Per le altre categorie, non scrive nulla sulla Lavagna (per ora)

4. Apri nel browser la console Firestore per mostrare la collection: cmd.exe /c start "https://console.firebase.google.com/project/nexo-hub-15f2d/firestore"

5. Committa con "feat(nexo): Lavagna - inter-colleague communication bus"
