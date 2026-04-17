Implementa il sistema "Richieste di sviluppo in-app" per IRIS.

COSA FARE:

1. Aggiorna la PWA (projects/iris/pwa/index.html):
   - Su ogni card email, aggiungi un piccolo bottone "💡 Idea" (o icona lampadina)
   - Cliccando si apre un modale con:
     - Titolo: "Cosa vorresti che IRIS facesse per questo tipo di email?"
     - Campo textarea grande per scrivere la richiesta in linguaggio naturale
     - Checkbox: "Applica a tutte le email di questa categoria" (pre-selezionata)
     - La categoria dell'email corrente mostrata come contesto
     - Bottone "Invia richiesta"
   - Al click su "Invia richiesta":
     - Salva in Firestore collection nexo_dev_requests con:
       {
         id: auto,
         emailId: id dell'email corrente,
         emailCategory: categoria dell'email,
         emailSender: mittente,
         emailSubject: oggetto,
         request: testo scritto dall'utente,
         applyToCategory: bool (dalla checkbox),
         status: "pending",
         createdAt: timestamp
       }
     - Mostra toast "Richiesta inviata! Verrà implementata a breve."
     - Chiudi il modale

2. Aggiungi anche un bottone globale "💡 Idea generale" nell'header della dashboard (non legato a una email specifica) che apre lo stesso modale ma senza contesto email.

3. Crea una sezione nella PWA (accessibile da un tab o bottone "📋 Richieste") che mostra tutte le dev requests con il loro stato: pending, in_progress, completed.

4. Crea projects/iris/scripts/export_dev_requests.py:
   - Legge da Firestore collection nexo_dev_requests tutte le richieste con status "pending"
   - Per ogni richiesta, crea un file in tasks/ nel repo maestro-bridge nel formato che MAESTRO si aspetta
   - Così le richieste diventano automaticamente task per Claude Code

5. Rideploya PWA su Firebase Hosting
6. Apri nel browser
7. Committa con "feat(iris): in-app dev requests - build IRIS from IRIS"
