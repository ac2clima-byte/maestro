Aggiungi alla PWA (projects/iris/pwa/index.html) un campo "Richiesta sviluppo" su ogni card email.

1. Su ogni card email, aggiungi un bottone piccolo "🛠️ Dev" che espande un campo di testo
2. Il campo ha placeholder: "Scrivi cosa vorresti per questo tipo di email..."
3. Bottone "Invia richiesta" che salva in Firestore collection nexo_dev_requests con:
   - id: auto
   - emailId: id dell'email corrente
   - emailCategory: la categoria di questa email
   - request: il testo scritto dall'utente
   - status: "pending"
   - createdAt: timestamp
4. Dopo l'invio, mostra un toast/messaggio "Richiesta inviata a MAESTRO"
5. Il campo si chiude dopo l'invio

Non serve implementare la lettura delle richieste lato MAESTRO per ora — solo la scrittura da PWA a Firestore.

Rideploya su Firebase Hosting.
Apri nel browser.
Committa con "feat(iris): dev request field per email"
