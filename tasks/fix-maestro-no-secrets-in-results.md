Fix critico a maestro.mjs:

Il problema: la funzione processTask() cattura l'intero output del pannello tmux e lo salva in results/. Questo include credenziali, API key, password che Claude Code stampa a console durante l'esecuzione.

FIX:
Modifica maestro.mjs — nella funzione processTask(), NON salvare più l'output di tmux capture-pane nei file results/. Invece salva solo:
- task_id
- timestamp esecuzione
- stato: completato/timeout
- UN RIASSUNTO di max 3 righe (non l'output raw)

Il file results/ deve contenere SOLO metadati, MAI output raw della sessione.

Committa con "security(maestro): stop logging raw tmux output in results"
