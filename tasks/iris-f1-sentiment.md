Implementa F1 — Sentiment Analysis per IRIS.

COSA FARE:

1. Aggiorna projects/iris/src/types/classification.ts:
   - Aggiungi tipo SentimentLevel: "positivo" | "neutro" | "frustrato" | "arrabbiato" | "disperato"
   - Aggiungi campo sentiment: SentimentLevel a EmailClassification
   - Aggiungi campo sentimentReason: string (breve spiegazione del perché)

2. Aggiorna projects/iris/prompts/classifier.md:
   - Aggiungi al JSON di risposta i campi "sentiment" e "sentimentReason"
   - Spiega al modello come valutare il sentiment:
     - positivo: ringraziamenti, soddisfazione, conferme positive
     - neutro: richieste normali, comunicazioni di routine
     - frustrato: tono impaziente, solleciti, lamentele moderate
     - arrabbiato: tono aggressivo, minacce, maiuscole, punti esclamativi multipli
     - disperato: richieste disperate, emergenze percepite, tono supplicante
   - Istruisci: "Valuta il tono complessivo dell'email, non solo le parole. Un 'Gentilissimi' seguito da una lamentela dettagliata è frustrato, non positivo."

3. Aggiorna projects/iris/src/classifier/Classifier.ts:
   - Aggiorna parseClassification per validare il nuovo campo sentiment
   - Se il modello non ritorna sentiment, default a "neutro"

4. Aggiorna la PWA (projects/iris/pwa/index.html):
   - Aggiungi badge sentiment su ogni card email, accanto alla confidenza
   - Colori: positivo=verde, neutro=grigio, frustrato=giallo, arrabbiato=arancione, disperato=rosso
   - Emoji opzionale: 😊 😐 😤 😡 😰

5. Riesegui la pipeline sulle ultime 30 email per classificarle con il sentiment

6. Rideploya la PWA su Firebase Hosting

7. Apri https://nexo-hub-15f2d.web.app nel browser

8. Committa con "feat(iris): F1 sentiment analysis"
