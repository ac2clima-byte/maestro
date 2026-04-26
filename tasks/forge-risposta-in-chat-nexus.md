Quando Claude Code completa l'analisi o il fix di una dev-request che viene dalla chat NEXUS (type="bug_from_chat"), deve scrivere il risultato nella STESSA sessione chat di NEXUS.

## Implementazione

In maestro.mjs, dopo che Claude Code completa una dev-request:

1. Leggi il documento nexo_dev_requests/{id} da Firestore
2. Se il tipo è "bug_from_chat" e ha un sessionId:
   - Leggi il file dev-analysis-{id}.md che Claude Code ha scritto
   - Estrai: diagnosi breve + proposta di soluzione + stato (analizzato/fixato)
   - Scrivi un messaggio nella collection nexus_chat con:
     ```json
     {
       "sessionId": "[sessionId originale del bug]",
       "role": "assistant",
       "content": "Ho analizzato il problema: [diagnosi breve]. [proposta]. Lo sto fixando.",
       "source": "forge",
       "createdAt": serverTimestamp
     }
     ```
3. Quando il fix è stato implementato e deployato (risultato del task di implementazione):
   - Scrivi un altro messaggio:
     ```json
     {
       "sessionId": "[sessionId]",
       "role": "assistant", 
       "content": "Fix applicato e deployato. [cosa è cambiato]. Riprova.",
       "source": "forge",
       "createdAt": serverTimestamp
     }
     ```

4. Alberto apre NEXUS Chat e vede i messaggi di FORGE nella conversazione:
   - "Ho analizzato il problema: NEXUS non filtra per data negli interventi. Sto fixando."
   - "Fix applicato. Ora puoi chiedere 'interventi di Federico venerdì ad Alessandria' e filtra per data e città. Riprova."

5. I messaggi FORGE devono avere uno stile diverso nella chat (es. sfondo leggermente diverso o prefisso "🔧 FORGE:")

Deploy + test + email report.
Committa con "feat(forge): risposta fix in chat NEXUS"
