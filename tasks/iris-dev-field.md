Feature speciale: campo "Richiesta sviluppo" nella PWA di IRIS.

CONTESTO:
Alberto vuole poter scrivere richieste di sviluppo direttamente dalla PWA mentre usa IRIS. Vede un'email, ha un'idea per migliorare IRIS, la scrive lì senza cambiare finestra. La richiesta viene salvata e poi implementata tramite MAESTRO.

IMPLEMENTA:

1. Aggiungi alla PWA (projects/iris/pwa/index.html):
   
   a. Su ogni card email, un bottone piccolo "🛠️ Dev" (icona ingranaggio o chiave inglese)
   
   b. Cliccando "Dev" si apre un modale con:
      - Titolo: "Richiesta sviluppo per questa email"
      - Riferimento all'email (mittente, oggetto, categoria — precompilato, read-only)
      - Campo textarea grande: "Descrivi cosa vorresti implementare..."
      - Placeholder: "Es: Aggiungi un bottone che inoltra automaticamente a Malvicino quando la categoria è GUASTO_URGENTE"
      - Bottone "Invia richiesta"
   
   c. Anche un bottone globale "🛠️ Nuova richiesta dev" nell'header, per richieste non legate a una email specifica

2. Quando l'utente invia:
   - Salva in Firestore collection nexo_dev_requests:
     {
       id: auto,
       description: testo della richiesta,
       emailRef: { id, sender, subject, category } oppure null se globale,
       status: "pending",
       createdAt: timestamp
     }
   - Mostra toast "✅ Richiesta inviata"

3. Aggiungi una pagina/sezione "Dev Requests" accessibile da un bottone nell'header:
   - Lista delle richieste inviate
   - Stato: pending / in-progress / completata
   - Ordinata per data

4. Crea anche un file tasks/dev-requests-watcher.md che spiega:
   "MAESTRO può pollare la collection nexo_dev_requests su Firestore e trasformare ogni richiesta in un task per Claude Code. Questo trasforma la PWA in un'interfaccia di sviluppo."

5. Rideploya su Firebase Hosting
6. Apri nel browser
7. Committa con "feat(iris): dev requests field - build from the app"
