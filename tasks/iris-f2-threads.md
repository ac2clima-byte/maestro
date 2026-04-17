Implementa F2 — Thread Detection per IRIS.

COSA FARE:

1. Crea projects/iris/src/threads/ThreadDetector.ts:
   - Classe che analizza le email in Firestore e raggruppa quelle che appartengono alla stessa conversazione
   - Criteri di raggruppamento:
     a. Stesso subject (normalizzato: rimuovi "Re:", "Fwd:", "R:", "I:" e confronta)
     b. Stesso mittente/destinatario (bidirezionale: email da A a B e da B a A sono stesso thread)
     c. Reference/In-Reply-To headers se disponibili dall'EWS
   - Ogni thread ha: id, subject normalizzato, lista email ordinate per data, conteggio, ultimo messaggio, partecipanti

2. Aggiorna projects/iris/src/types/firestore.ts:
   - Aggiungi IrisThreadDoc: { id, normalizedSubject, emailIds[], participants[], messageCount, lastMessageAt, firstMessageAt, sentiment_evolution: SentimentLevel[] }
   
3. Aggiorna la pipeline (projects/iris/scripts/pipeline.py):
   - Dopo la classificazione, esegui il thread detection
   - Salva/aggiorna i thread in Firestore collection iris_threads

4. Aggiorna la PWA (projects/iris/pwa/index.html):
   - Aggiungi un toggle in alto: "Visualizza per email" / "Visualizza per thread"
   - In modalità thread: mostra card raggruppate con contatore messaggi, ultimo messaggio, timeline espandibile
   - Cliccando su un thread si espande e mostra tutte le email del thread in ordine cronologico
   - Mostra evoluzione sentiment nel thread (emoji in sequenza)

5. Riesegui la pipeline sulle 30 email per creare i thread

6. Rideploya PWA su Firebase Hosting

7. Apri https://nexo-hub-15f2d.web.app nel browser

8. Committa con "feat(iris): F2 thread detection"
