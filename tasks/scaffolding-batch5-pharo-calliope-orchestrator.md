PREREQUISITO: esegui dopo scaffolding-batch4.

Leggi context/nexo-architettura.md. Crea lo scaffolding per PHARO, CALLIOPE e l'Orchestratore.

PHARO (projects/pharo/):
- Collega Monitoring: heartbeat, alert, budget, anomalie
- Tipi: Alert (severita, stato, ricorrenze), Heartbeat, HealthCheck (punteggioSalute), RegolaMonitoring
- Azioni: controlloHeartbeat, budgetAnthropic, costiInfrastruttura, impiantiOrfani, emailSenzaRisposta, interventiBloccati, fattureNonInviate, clientiSilenziosi, duplicatiDatabase, statoSuite, reportSalute, alertAttivi, acknowledgeAlert, risolviAlert, silenziaAlert, listaRegole, creaRegola, eseguiControlliPeriodici
- Nessun LLM, solo regole e cron
- .env: FIREBASE_PROJECT_ID=nexo-hub-15f2d, COSMINA_PROJECT_ID, ANTHROPIC_BUDGET_MONTHLY=50, HEARTBEAT_INTERVAL_SECONDS=300
- Ascolta Lavagna: anomalia_rilevata (da DELPHI)

CALLIOPE (projects/calliope/):
- Collega Content: bozze email, preventivi, solleciti, PEC, newsletter
- Tipi: Bozza (tipo, tono, stato, versione, versioniPrecedenti, contesto), Template, StileDestinatario
- Azioni: bozzaRisposta, comunicazioneCondominio, preventivoFormale, sollecitoPagamento, rispostaPEC, offertaCommerciale, newsletterTecnici, comunicazioneMassiva, trascriviAudio, verbaleRiunione, revisiona, approva, rifiuta, listaTemplate, creaTemplate, generaDaTemplate, imparaStile
- Prompt system.md: stile aziendale ACG, toni, regole, formato JSON output
- LLM_MODEL=claude-sonnet-4-20250514 (qualità del testo)
- .env: ANTHROPIC_API_KEY, GRAPH_API_URL, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: richiesta_bozza, richiesta_sollecito, richiesta_pec

ORCHESTRATORE (projects/nexo-orchestrator/):
- Coordina flussi multi-Collega, routing, escalation
- Tipi: Workflow (trigger, steps), WorkflowStep, FlowInstance, FlowStepInstance, EscalationRule, RoutingRule
- Azioni: route, routingIntelligente, avviaWorkflow, avantiStep, eseguiStep, checkPending, checkFlowTimeout, escalate, flowAttivi, flowStorico, statisticheFlow, listaRoutingRules, creaRoutingRule, listaEscalationRules, creaEscalationRule, listaWorkflows, creaWorkflow
- 4 workflow predefiniti: guasto_urgente, incassi_email, fattura_fornitore, pec_ricevuta (crea i file JSON in projects/nexo-orchestrator/workflows/)
- LLM_MODEL=claude-haiku-4-5 (routing veloce)
- .env: FIREBASE_PROJECT_ID=nexo-hub-15f2d, ANTHROPIC_API_KEY, PENDING_TIMEOUT_MINUTES=30, ESCALATION_CHANNEL=whatsapp
- Ascolta Lavagna: tutti i messaggi con to="orchestrator"

DRY_RUN=false in tutti.
Committa con "feat(nexo): scaffolding PHARO + CALLIOPE + Orchestratore"
