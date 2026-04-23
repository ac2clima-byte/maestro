Aggiungi un bottone per cancellare la chat NEXUS.

1. Nella barra header del pannello chat NEXUS (dove c'è il titolo e la X di chiusura), aggiungi un'icona 🗑️ a sinistra della X
2. Click → conferma "Cancellare la conversazione?" con due bottoni: Sì / No
3. Se Sì:
   - Svuota i messaggi visibili nella chat
   - Crea una nuova sessione in Firestore (nuovo sessionId)
   - La vecchia sessione resta in nexus_chat (storico) ma non viene più caricata
   - Mostra di nuovo il messaggio di benvenuto con gli esempi cliccabili
4. Non cancellare mai i dati da Firestore — solo nuova sessione

Deploy hosting.
Committa con "feat(nexus): bottone cancella chat"
