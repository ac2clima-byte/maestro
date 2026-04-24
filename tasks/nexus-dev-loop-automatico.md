Implementa il loop automatico: NEXUS → Claude Code analizza → Claude Chat rivede → Claude Code implementa.

Il flusso:

1. Alberto scrive su NEXUS una richiesta di sviluppo (modifica, bug, feature)
2. NEXUS la riconosce come dev request e salva:
   - In nexo_dev_requests su Firestore
   - In tasks/dev-request-[timestamp].md nel repo → git push

3. MAESTRO vede il file dev-request-* ma NON lo esegue come task normale
   - Aggiorna maestro.mjs: se il file inizia con "dev-request-", esegui un prompt DIVERSO:
     "Leggi questo file dev-request. Analizza il problema. Studia il codice coinvolto. Scrivi la tua analisi e proposta di soluzione in tasks/dev-analysis-[stesso-timestamp].md. NON implementare nulla. Solo analisi."

4. Claude Code scrive l'analisi e la pusha

5. All'inizio di ogni nuova conversazione Claude Chat:
   - Claude Chat fa git pull
   - Controlla se ci sono file dev-analysis-*.md senza un corrispondente dev-approved-*.md
   - Se ci sono: li legge, ne discute con Alberto, e se Alberto approva → crea il task vero in tasks/

6. Dopo l'approvazione di Claude Chat:
   - Il task viene scritto in tasks/ (senza prefisso dev-request)
   - MAESTRO lo esegue normalmente con Claude Code
   - Claude Code implementa

## Implementazione concreta

### A. NEXUS — riconoscimento dev requests

In handlers/nexus.js, aggiungi al routing:
- Pattern: "non funziona", "bug", "errore", "modifica", "aggiungi", "implementa", "cambia", "migliora", "vorrei", "dovresti", "perché non"
- Azione: salva in nexo_dev_requests + scrivi file dev-request-[timestamp].md + git add + commit + push
- Risposta naturale: "Ho capito, passo la richiesta al team di sviluppo. Ti farò sapere quando è risolta."

### B. MAESTRO — gestione dev-request

In maestro.mjs, modifica la logica di task detection:
- Se il file si chiama dev-request-*:
  - NON eseguire il contenuto del file come prompt
  - Manda a Claude Code: "Leggi il file tasks/dev-request-[nome].md. Analizza il problema nel codice. Proponi una soluzione. Scrivi tutto in tasks/dev-analysis-[nome].md. NON implementare nulla, solo analisi e proposta."
  - Scrivi il risultato in results/dev-request-[nome].md

### C. Claude Chat — check automatico

Aggiungi al CLAUDE.md del repo:
```
## Dev Requests
All'inizio di ogni conversazione, controlla automaticamente:
git pull origin main && ls tasks/dev-request-*.md
Se ci sono dev-request senza corrispondente dev-approved, leggili e discutili con Alberto.
```

### Test

1. Apri NEXUS Chat e scrivi: "il report mensile di CHARTA non mostra i dati reali"
2. Verifica che venga creato tasks/dev-request-xxx.md
3. Verifica che MAESTRO mandi a Claude Code per analisi
4. Verifica che Claude Code crei tasks/dev-analysis-xxx.md
5. Verifica che la prossima sessione Claude Chat lo trovi

Committa con "feat(nexo): loop dev requests NEXUS → Code analisi → Chat review → Code implementa"
