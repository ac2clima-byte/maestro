Implementa F6 — Auto-tagging Allegati per IRIS.

1. Aggiorna ews_poller.py per estrarre info allegati (nome file, tipo MIME, dimensione) — NON scaricare il contenuto degli allegati per ora, solo metadati
2. Aggiungi campo attachments: [{filename, mimeType, size}] a IrisEmailDoc
3. Nel classificatore: se l'email ha allegati, includi i nomi file nel prompt così Haiku può classificare ("allegato: Fattura_2026_0412.pdf" → probabilmente fattura)
4. Nella PWA: mostra icone allegati nella card (📄 PDF, 📸 immagine, 📊 Excel) con nome file
5. Rideploya PWA, apri nel browser
6. Committa con "feat(iris): F6 attachment tagging"
