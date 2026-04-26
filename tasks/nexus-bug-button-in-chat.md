Aggiungi un bottone 🐛 nella chat NEXUS che manda tutta la conversazione come dev-request a Claude Code.

## Implementazione

1. Nella chat NEXUS (header o footer della chat), aggiungi un bottone piccolo 🐛 "Segnala"
   - Posizione: nell'header della chat, accanto agli altri bottoni (fullscreen, voce, cancella)
   - Stile: piccolo, discreto, rosso/arancione

2. Click sul bottone:
   - Raccoglie gli ULTIMI 10 messaggi della conversazione (user + assistant)
   - Mostra un campo opzionale: "Cosa non va?" (textarea piccola)
   - Alberto può aggiungere una nota: "non mi mostra le altre email" o lasciare vuoto
   - Click "Invia" → salva in nexo_dev_requests con:
     ```json
     {
       "type": "bug_from_chat",
       "note": "cosa ha scritto Alberto",
       "conversation": [
         { "role": "user", "content": "guarda le mail" },
         { "role": "assistant", "content": "Hai 2 email di oggi..." },
         { "role": "user", "content": "guarda le altre" },
         { "role": "assistant", "content": "Non ho capito bene..." }
       ],
       "sessionId": "sessione corrente",
       "status": "pending",
       "createdAt": serverTimestamp
     }
     ```

3. MAESTRO pollerà nexo_dev_requests → crea tasks/dev-request-{id}.md con la conversazione completa
   - Claude Code vede ESATTAMENTE cosa è andato storto
   - Il file deve contenere: la nota di Alberto + tutta la conversazione + sessionId

4. Risposta nella chat dopo il click: "Bug segnalato. Claude Code lo analizzerà."

5. Non serve conferma - un click e via

Deploy hosting.
Email report.
Committa con "feat(nexus): bottone bug in chat con contesto conversazione"
