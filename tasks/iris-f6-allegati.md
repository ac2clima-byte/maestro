Implementa F6 — Auto-tagging Allegati per IRIS.

1. Aggiorna projects/iris/scripts/pipeline.py e il poller EWS:
   - Quando una email ha allegati, scarica il nome e tipo MIME di ogni allegato
   - Per i PDF: se possibile, estrai le prime righe di testo con un tool Python (pdfplumber o PyPDF2 se installato)
   - Classifica l'allegato: fattura, DDT, preventivo, scheda_tecnica, contratto, foto, altro

2. Aggiorna IrisEmailDoc in Firestore:
   - Aggiungi campo attachments: [{ filename, mimeType, size, detectedType, extractedText? }]

3. Aggiorna la PWA:
   - Nella card email mostra gli allegati come chips: "📎 Fattura €1.250 (PDF)" o "📷 2 foto"
   - Se c'è testo estratto, mostralo nel modale "Leggi email"

4. Riesegui pipeline, rideploya PWA, apri nel browser
5. Committa con "feat(iris): F6 auto-tagging allegati"
