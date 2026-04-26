Implementa il handler per consultare i preventivi emessi su DOC, come descritto in tasks/dev-analysis-J9tIBTJnMp6GhkQvGi7J.md.

1. Nuovo handler handlePreventiviEmessi in handlers/preventivo.js:
   - Legge docfin_documents su garbymobile-f89ac con filtro type="PRV"
   - Filtra per data se specificata ("oggi", "questa settimana", "aprile")
   - Ritorna lista: numero, data, intestatario, importo, stato
   - Link a DOC per ogni preventivo

2. Aggiungi al system prompt di Haiku in nexus.js:
   - Nuova azione: "preventivi_emessi" per domande tipo "abbiamo preventivi oggi?", "lista preventivi su DOC", "preventivo De Amicis"

3. Aggiungi DIRECT_HANDLERS regex in nexus.js:
   - "preventiv.* (emess|fatt|su doc|oggi|questa settimana)" → handlePreventiviEmessi

4. Testa con nexusTestInternal:
   - "abbiamo un preventivo datato oggi su doc?" → deve mostrare PRE-001/2026
   - "lista preventivi" → deve mostrare tutti

Deploy + test + email report.
Committa con "feat(preventivo): handler preventivi emessi su DOC"
