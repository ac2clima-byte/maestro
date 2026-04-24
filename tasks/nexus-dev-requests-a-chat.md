Quando Alberto scrive una richiesta di sviluppo in NEXUS Chat, deve essere salvata in modo che Claude Chat possa leggerla.

1. NEXUS già salva in nexo_dev_requests. Aggiungi anche il salvataggio come file nel repo:
   - Scrivi la richiesta in tasks/dev-request-[timestamp].md
   - Formato:
     ```
     # Richiesta sviluppo da NEXUS
     Data: [timestamp]
     Richiesta: [testo di Alberto]
     Contesto: [eventuale contesto dalla conversazione]
     ```
   - git add + commit + push automatico

2. Così io (Claude Chat) la vedo nel repo quando faccio git pull

3. NON deve essere eseguita da Claude Code — è solo un file nella cartella tasks/ ma con prefisso "dev-request-" che MAESTRO deve IGNORARE (non eseguire)

4. Aggiorna maestro.mjs: skippa i task che iniziano con "dev-request-"

5. Rispondi ad Alberto in chat: "Ho registrato la richiesta e la mando a Claude Chat. La vedrai nella prossima conversazione."

6. Committa con "feat(nexus): richieste sviluppo inviate a Claude Chat"
