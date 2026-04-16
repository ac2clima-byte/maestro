Fase 4 di IRIS — Modello dati Firestore + API HTTPS per la PWA.

TASK:

1. Crea projects/iris/src/types/firestore.ts con le interfacce dei documenti Firestore:

   - IrisEmailDoc: {
       id: string (message_id da Exchange),
       userId: string (sempre "alberto" per v0.1, multi-user ready),
       raw: { subject, sender, body_text, received_time, has_attachments, importance },
       classification: EmailClassification,
       status: "classified" | "corrected" | "archived",
       correction?: { category, suggestedAction, notes, correctedAt },
       createdAt: timestamp,
       updatedAt: timestamp
     }

   - IrisCorrectionDoc: {
       id: string (auto),
       userId: string,
       emailId: string (ref a IrisEmailDoc),
       originalCategory: ClassificationType,
       correctedCategory: ClassificationType,
       originalAction: SuggestedAction,
       correctedAction: SuggestedAction,
       notes: string,
       createdAt: timestamp
     }

2. Crea projects/iris/src/api/routes.ts con gli endpoint:
   - GET /api/emails — lista email classificate (filtro per userId, paginazione, filtro per categoria)
   - GET /api/emails/:id — dettaglio singola email
   - POST /api/emails/:id/correct — invia correzione (body: { category, suggestedAction, notes })
   - GET /api/stats — statistiche (totale email, per categoria, % correzioni, confidenza media)

   Per ora implementa solo le interfacce e i tipi delle request/response, non la logica Firestore vera (quella verrà col deploy). Usa funzioni stub che ritornano dati mock.

3. Crea projects/iris/tests/api.test.ts con test sugli endpoint mock

4. Committa con "feat(iris): Firestore schema + API routes"
