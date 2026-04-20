# NEXO Orchestrator

**Stato:** Da costruire.

**Ruolo:** coordina flussi che coinvolgono più Colleghi. Legge la
Lavagna, decide chi deve fare cosa quando la situazione è ambigua,
instrada i messaggi `to: "orchestrator"` al Collega corretto, gestisce
escalation su flussi in timeout.

## Quando serve

- Un messaggio sulla Lavagna ha `to: "orchestrator"` (il mittente non sa
  a chi mandarlo).
- Un flusso richiede coordinamento sequenziale (IRIS → ARES → CHRONOS →
  ECHO).
- Un conflitto tra Colleghi (ARES vuole uno slot che CHRONOS dice
  occupato).
- Un task resta `pending` oltre la soglia (`PENDING_TIMEOUT_MINUTES`) →
  escalation a ECHO.

## Quando NON serve

- Messaggi diretti Collega → Collega (IRIS → ARES): passano senza
  orchestrazione.
- Azioni semplici dentro un singolo Collega.

## Cosa fa (azioni esposte)

### Routing

- `route(msg)` — decide `to` corretto per un messaggio generico
- `routingIntelligente(msg)` — decisione via LLM (Haiku) per casi
  ambigui

### Workflow

- `avviaWorkflow(workflowId, contesto)` — istanzia un flusso multi-step
- `avantiStep(flowInstanceId)` — esegue il prossimo step
- `eseguiStep(flowInstanceId, stepId)` — esegue uno step specifico
- `checkPending()` — cron: messaggi in pending troppo tempo
- `checkFlowTimeout()` — cron: flow che non avanzano
- `escalate(flowInstanceId | alertId, motivo)` — notifica ECHO
  (`escalation`)

### Stato flow

- `flowAttivi()` — flow in corso ora
- `flowStorico(query?)` — storico flow completati/falliti
- `statisticheFlow(finestra)` — durata media, success rate per workflow

### Gestione regole

- `listaRoutingRules()` / `creaRoutingRule(rule)`
- `listaEscalationRules()` / `creaEscalationRule(rule)`
- `listaWorkflows()` / `creaWorkflow(workflow)`

## Riceve dalla Lavagna

- Qualsiasi messaggio con `to == "orchestrator"`
- Qualsiasi messaggio in stato `pending` oltre la soglia

## Scrive sulla Lavagna

- Rewriting del messaggio con `to` corretto (dopo `route`)
- `escalation` → ECHO
- Messaggi nuovi per coordinare i step dei workflow

## Non fa

- Non esegue le azioni di dominio dei Colleghi (le orchestra soltanto).
- Non modifica i dati operativi direttamente.
- Non è una regola IRIS (quella vive in IRIS).

## Workflow predefiniti (in `workflows/*.json`)

1. **`guasto_urgente.json`** — IRIS(GUASTO_URGENTE) → ARES(apriIntervento)
   → CHRONOS(slot critico) → ECHO(notifica Alberto + chiamata)
2. **`incassi_email.json`** — IRIS → CHARTA(estraiIncassiDaEmail) →
   CHARTA(riconciliaAutomatica) → ECHO(conferma)
3. **`fattura_fornitore.json`** — IRIS → CHARTA(parseFatturaFornitore) →
   CHARTA(registraFattura) → DELPHI(opzionale: aggiorna esposizione
   fornitori)
4. **`pec_ricevuta.json`** — IRIS → DIKEA(gestisciPEC) →
   CALLIOPE(rispostaPEC) → Alberto approva → ECHO(invia PEC)

## Collections Firestore

- `nexo_orchestrator_log` — ogni decisione di routing (per audit)
- `nexo_workflows` — definizioni workflow
- `nexo_workflow_instances` — istanze attive/concluse
- `nexo_routing_rules` — regole statiche di routing
- `nexo_escalation_rules` — regole escalation

## Stack

Node.js + TypeScript. Cloud Function (trigger Firestore `onCreate` su
`nexo_lavagna`) + cron scheduler per i check periodici.

## Modello AI

`LLM_MODEL=claude-haiku-4-5` (default). Haiku preferito a Sonnet per:

1. Routing deve essere **veloce** (onCreate trigger: meno di un secondo).
2. La decisione è semplice ("quale Collega è più adatto?") → Haiku basta.
3. Volume potenzialmente alto (1 decisione per messaggio Lavagna
   ambiguo).

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `ANTHROPIC_API_KEY`
- `LLM_MODEL=claude-haiku-4-5`
- `PENDING_TIMEOUT_MINUTES=30` — dopo quanto un messaggio pending va in
  escalation
- `ESCALATION_CHANNEL=whatsapp` — canale ECHO per escalation
- `DRY_RUN=false` — se `true`, rewrite Lavagna e creazione workflow
  loggati ma non eseguiti

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] Cloud Function `onCreate` su `nexo_lavagna` con filtro
  `to == "orchestrator"`
- [ ] Cron `checkPending` ogni 5 min (via Cloud Scheduler, richiede
  Blaze)
- [ ] 4 workflow base serializzati in `workflows/*.json` + loader
- [ ] Engine workflow con persistenza stato (`nexo_workflow_instances`)
- [ ] Logging `nexo_orchestrator_log` per audit
