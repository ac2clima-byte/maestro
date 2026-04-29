Aggiungi 2 pulsanti di invio nella chat NEXUS: uno per Groq (veloce) e uno per Claude Code Max (intelligente).

## PWA — UI

Nella chat NEXUS, sostituisci il singolo pulsante Invio con 2 pulsanti affiancati:

1. **⚡ Invia** (colore blu/default) — usa il routing attuale (Regex → Groq → Ollama)
   - Veloce: 0-3 secondi
   - Per domande semplici: interventi, mail, preventivi, condomini

2. **🧠 Claude** (colore viola/diverso) — manda la domanda a Claude Code via MAESTRO
   - Lento: 30-60 secondi
   - Per domande complesse: analisi, ragionamenti, domande aperte
   - Mostra indicatore "Claude sta pensando..." con animazione

Sia il pulsante ⚡ che 🧠 mandano il messaggio. La differenza è il campo `engine`:
- ⚡ → salva in nexus_chat con engine: "groq" (comportamento attuale)
- 🧠 → salva in nexus_chat con engine: "claude_code"

## Backend — Cloud Function

In nexusChat, quando engine === "claude_code":
1. NON chiamare il router Groq/Ollama
2. Scrivi un documento in nexo_claude_requests su nexo-hub-15f2d:
   ```json
   {
     "sessionId": "nx_xxx",
     "userMessage": "domanda di Alberto",
     "conversation": [ultimi 10 messaggi],
     "status": "pending",
     "createdAt": serverTimestamp,
     "engine": "claude_code"
   }
   ```
3. Rispondi subito in chat: "Claude sta pensando... (può impiegare fino a 60 secondi)"

## MAESTRO — Polling nexo_claude_requests

In maestro.mjs, aggiungi un polling ogni 15 secondi su nexo_claude_requests (status: pending):
1. Prendi il documento pending più vecchio
2. Manda la domanda a Claude Code via tmux:
   ```
   Sei NEXUS, l'assistente di ACG Clima Service. Alberto ti ha chiesto dalla chat NEXUS:
   "[domanda]"
   
   Contesto conversazione: [ultimi messaggi]
   
   Rispondi in modo naturale, conciso, in italiano. Se serve, cerca dati in Firestore.
   NON fare analisi del codice — rispondi alla domanda di Alberto come un collega esperto.
   ```
3. Aspetta la risposta di Claude Code
4. Scrivi la risposta in nexus_chat con:
   ```json
   {
     "sessionId": "nx_xxx",
     "role": "assistant",
     "content": "[risposta di Claude Code]",
     "source": "claude_code",
     "createdAt": serverTimestamp
   }
   ```
5. Aggiorna nexo_claude_requests status: "completed"

## PWA — Mostra risposta Claude

La PWA deve fare polling su nexus_chat (onSnapshot) e quando arriva un messaggio con source: "claude_code":
- Mostra con stile diverso (bordo viola, icona 🧠)
- Rimuovi il "Claude sta pensando..."

## Layout mobile

I 2 pulsanti devono stare bene su mobile:
- ⚡ a sinistra (più grande, è il default)
- 🧠 a destra (più piccolo)
- Oppure: pulsante singolo con long-press per Claude e tap per Groq

Deploy hosting + functions.
Email report.
Committa con "feat(nexus): doppio pulsante Groq + Claude Code Max"
