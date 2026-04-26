FASE 0: quando Alberto scrive una richiesta di fix/modifica su NEXUS Chat, deve arrivare sia a Claude Code che a Claude Chat.

## Come funziona oggi
NEXUS riconosce pattern dev ("non funziona", "aggiungi", "modifica") e salva in nexo_dev_requests su Firestore. Ma NON crea il file su GitHub e NON arriva a nessuno.

## Come deve funzionare

### Step 1 — NEXUS riconosce la dev request
In handlers/nexus.js, nel routing PRIMA di mandare a Haiku:
- Rileva pattern: "non funziona", "bug", "errore", "aggiungi", "modifica", "cambia", "vorrei", "implementa", "metti", "togli", "migliora", "fixare", "perché non", "dovrebbe"
- Se matchano: è una dev request, NON mandarla a Haiku per routing Collega

### Step 2 — Salva la dev request
- Salva in Firestore nexo_dev_requests con: testo, timestamp, sessionId, stato="pending"
- Genera un ID breve leggibile: DEV-001, DEV-002, ecc. (contatore in cosmina_config/nexo_counters)

### Step 3 — Crea file su GitHub
La Cloud Function nexusRouter (dopo aver salvato in Firestore) deve creare il file nel repo:
- NON può fare git push dalla Cloud Function (non ha accesso al repo)
- ALTERNATIVA: scrivi il file in Firestore nexo_dev_requests_queue
- Un poller locale (come MAESTRO) controlla nexo_dev_requests_queue ogni 15 secondi
- Se trova una nuova richiesta: crea tasks/dev-request-{id}.md e pusha su GitHub

### Step 4 — MAESTRO gestisce
- MAESTRO vede tasks/dev-request-*.md
- NON lo esegue come task normale
- Lo manda a Claude Code con prompt speciale: "Analizza questa dev request. Leggi il codice coinvolto. Scrivi la tua analisi e proposta in tasks/dev-analysis-{id}.md. NON implementare."

### Step 5 — Claude Code analizza
- Legge il problema
- Studia il codice
- Scrive l'analisi in tasks/dev-analysis-{id}.md
- Pusha su GitHub

### Step 6 — Claude Chat legge
- All'inizio di ogni conversazione Claude Chat fa: git pull && ls tasks/dev-request-*.md
- Legge le dev request e le analysis
- Ne discute con Alberto
- Se approva: crea il task implementativo

### Step 7 — Risposta a NEXUS
- Dopo il salvataggio, NEXUS risponde ad Alberto in chat:
  "Ho registrato la richiesta DEV-003: '[testo]'. Claude Code la sta analizzando. Ti aggiorno quando è pronta."
- Quando l'analisi è pronta (dev-analysis esiste): aggiorna la risposta in chat o manda notifica

## Implementazione concreta

### A. Aggiorna handlers/nexus.js
Aggiungi PRIMA di tutti gli altri handler:
```javascript
// Dev request detection
const DEV_PATTERNS = /non funziona|bug|errore|aggiungi|modifica|cambia|vorrei|implementa|metti|togli|migliora|fix|perch[eé] non|dovrebbe|manca|rotto|sbagliato/i;
if (DEV_PATTERNS.test(userMessage)) {
  return handleDevRequest(userMessage, sessionId, db);
}
```

### B. Crea handleDevRequest in handlers/nexus.js o handlers/dev-requests.js
```javascript
async function handleDevRequest(message, sessionId, db) {
  // 1. Genera ID progressivo
  // 2. Salva in nexo_dev_requests
  // 3. Salva in nexo_dev_requests_queue (per il poller locale)
  // 4. Rispondi in linguaggio naturale
}
```

### C. Crea il poller locale: scripts/dev_request_poller.js
```javascript
// Ogni 15 secondi:
// 1. Leggi nexo_dev_requests_queue dove status=="pending"
// 2. Per ogni richiesta: crea tasks/dev-request-{id}.md
// 3. git add + commit + push
// 4. Aggiorna status a "pushed"
```

### D. Aggiorna maestro.mjs
Quando trova un file dev-request-*:
- NON eseguire il contenuto
- Manda a Claude Code: "Leggi tasks/dev-request-{id}.md. Analizza il problema. Proponi soluzione in tasks/dev-analysis-{id}.md. NON implementare."

### E. Avvia il poller
Aggiungi al start-maestro.sh:
```bash
node ~/maestro-bridge/scripts/dev_request_poller.js &
```

## Test
1. Apri NEXUS Chat
2. Scrivi: "il report mensile non parsa i mesi in italiano"
3. Verifica:
   - NEXUS risponde "Ho registrato la richiesta DEV-001..."
   - nexo_dev_requests ha il documento
   - Entro 30 secondi: tasks/dev-request-DEV-001.md appare su GitHub
   - MAESTRO lo vede e manda a Claude Code per analisi
   - Claude Code scrive tasks/dev-analysis-DEV-001.md

Deploy functions.
Committa con "feat(nexo): Fase 0 - loop dev requests NEXUS → Code → Chat"
