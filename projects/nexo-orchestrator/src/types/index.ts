/**
 * NEXO Orchestrator — tipi.
 *
 * Riferimento: context/nexo-architettura.md sez. "L'Orchestratore".
 */

/** Un Collega noto al sistema (inclusi l'orchestrator e l'utente umano). */
export type ColleagueId =
  | "iris" | "echo" | "ares" | "chronos" | "memo"
  | "charta" | "emporion" | "dikea" | "delphi"
  | "pharo" | "calliope"
  | "orchestrator" | "alberto";

/** Singolo step di un workflow statico. */
export interface WorkflowStep {
  id: string;
  nome: string;
  /** Collega che esegue lo step. */
  to: ColleagueId;
  /** Tipo di messaggio Lavagna da inviare. */
  messageType: string;
  /** Mapping payload: prende dati dal contesto corrente del flow. */
  payloadTemplate?: Record<string, string>;
  /** Step che rende questo eseguibile (se presente). */
  dipendeDa?: string[];
  /** Timeout specifico in minuti. */
  timeoutMin?: number;
  /** Step opzionale (flow prosegue anche se fallisce). */
  opzionale?: boolean;
  /** Condizione bool (es. "contesto.importoTotale > 1000"). */
  condizione?: string;
}

/** Definizione di un workflow. Persistita in `nexo_workflows` e in file JSON. */
export interface Workflow {
  id: string;
  nome: string;
  descrizione?: string;
  versione: number;
  /** Trigger: tipo di messaggio Lavagna che inizia il flow. */
  trigger: {
    tipo: "messaggio_lavagna";
    messageType: string;
    fromOptional?: ColleagueId[];
    condizione?: string;
  };
  steps: WorkflowStep[];
  /** Tipo di terminazione: "tutti_completati" | "primo_completato". */
  modalitaFine?: "tutti_completati" | "primo_completato";
  attivo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StatoFlowStep =
  | "pending"
  | "pronto"
  | "in_corso"
  | "completato"
  | "fallito"
  | "saltato"
  | "scaduto";

export type StatoFlow =
  | "avviato"
  | "in_corso"
  | "completato"
  | "fallito"
  | "escalato"
  | "annullato";

/** Istanza di esecuzione di uno step. */
export interface FlowStepInstance {
  stepId: string;
  stato: StatoFlowStep;
  /** Messaggio Lavagna creato per questo step. */
  lavagnaMsgId?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failedReason?: string;
  risultato?: Record<string, unknown>;
  tentativi?: number;
}

/** Istanza di esecuzione di un workflow. `nexo_workflow_instances`. */
export interface FlowInstance {
  id: string;
  workflowId: string;
  workflowVersione: number;
  stato: StatoFlow;
  /** Messaggio che ha innescato il flow. */
  triggerMsgId: string;
  /** Contesto accumulato durante il flow (input + output step). */
  contesto: Record<string, unknown>;
  steps: FlowStepInstance[];
  /** Timestamp principali. */
  avviatoIl: string;
  completatoIl?: string;
  ultimoAvanzamento?: string;
  escalatoA?: ColleagueId;
  escalatoIl?: string;
  escalatoMotivo?: string;
}

/** Regola di routing statica (no LLM). */
export interface RoutingRule {
  id: string;
  nome: string;
  priorita: number;
  attiva: boolean;
  /** Predicato su messaggio Lavagna. */
  matchIf: {
    type?: string | string[];
    fromOneOf?: ColleagueId[];
    priorityMin?: "low" | "normal" | "high" | "critical";
    payloadHas?: string[];        // chiavi che devono esistere
  };
  /** Azione: nuovo destinatario o invocazione workflow. */
  then: {
    routeTo?: ColleagueId;
    startWorkflow?: string;
  };
  descrizione?: string;
}

/** Regola di escalation (su pending troppo lunghi). */
export interface EscalationRule {
  id: string;
  nome: string;
  attiva: boolean;
  /** Match: messaggi pending oltre N minuti, eventualmente filtrati. */
  matchIf: {
    minutiPending: number;
    type?: string | string[];
    toOneOf?: ColleagueId[];
    priorityMin?: "low" | "normal" | "high" | "critical";
  };
  then: {
    escalateTo: ColleagueId;       // tipicamente "echo"
    channel?: "whatsapp" | "telegram" | "email" | "push";
    testoOverride?: string;
  };
}

/** Entry di log delle decisioni orchestratore (audit). */
export interface OrchestratorLogEntry {
  id: string;
  at: string;
  decisione: "route" | "start_workflow" | "advance_step" | "escalate" | "timeout" | "noop";
  inputMsgId?: string;
  flowInstanceId?: string;
  /** Regola / workflow applicato. */
  regolaId?: string;
  workflowId?: string;
  /** Output sintetico della decisione (es. nuovo to). */
  output?: Record<string, unknown>;
  /** Se la decisione è passata per LLM, qui il ragionamento. */
  reasoning?: string;
  durataMs?: number;
}
