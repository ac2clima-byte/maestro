Quando Alberto scrive una richiesta di sviluppo in NEXUS, Claude Code deve ANALIZZARLA ma NON eseguirla.

## Flusso

1. Alberto scrive in NEXUS: "aggiungi il bottone X a IRIS"
2. NEXUS riconosce che è una richiesta di sviluppo (intent: richiesta_sviluppo)
3. NEXUS salva in tasks/dev-request-[timestamp].md con questo formato:

```markdown
# Dev Request — Analisi richiesta (NON ESEGUIRE)

ISTRUZIONE PER CLAUDE CODE: NON implementare questa modifica. 
Analizza la richiesta e scrivi un piano dettagliato.
Salva l'analisi in dev-requests/analisi-[timestamp].md
Claude Chat leggerà l'analisi e deciderà se procedere.

## Richiesta di Alberto
[testo originale]

## Cosa devi fare
1. Analizza la richiesta: cosa serve modificare? quali file? quante righe?
2. Rischi: può rompere qualcosa? serve testare?
3. Stima tempo: quanto ci vuole?
4. Dipendenze: serve altro prima?
5. Alternative: c'è un modo migliore?
6. Piano di implementazione: step by step

Salva tutto in dev-requests/analisi-[timestamp].md e committa.
```

4. MAESTRO recapita a Claude Code
5. Claude Code analizza e scrive il piano in dev-requests/analisi-[timestamp].md
6. Committa e pusha
7. Alberto dice a Claude Chat "controlla dev requests"
8. Claude Chat legge, discute con Alberto, e se approvato pusha il task di esecuzione

## Implementazione

1. Aggiorna handlers/nexus.js: quando intent è "richiesta_sviluppo":
   - Crea il file tasks/dev-request-[timestamp].md con il formato sopra
   - Committa e pusha
   - Rispondi ad Alberto: "Ho mandato la richiesta a Claude Code per l'analisi. Quando parli con Claude Chat, digli di controllare le dev requests."

2. Crea la cartella dev-requests/ nel repo (gitkeep)

3. Aggiorna maestro.mjs: i task "dev-request-*" vengono eseguiti normalmente (Claude Code li analizza) ma il prompt dice di NON implementare

4. Rispondi ad Alberto in NEXUS in linguaggio naturale

5. Committa con "feat(nexus): dev requests con analisi Claude Code per Claude Chat"
