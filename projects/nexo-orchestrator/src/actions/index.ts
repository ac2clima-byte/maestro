/**
 * NEXO Orchestrator — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  ColleagueId,
  EscalationRule,
  FlowInstance,
  RoutingRule,
  Workflow,
} from "../types/index.js";

// ─── Routing ────────────────────────────────────────────────────

export interface LavagnaMessage {
  id: string;
  from: ColleagueId;
  to: ColleagueId;
  type: string;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "critical";
}

export interface RouteResult {
  msgId: string;
  nuovoTo?: ColleagueId;
  workflowAvviatoId?: string;
  regolaApplicata?: string;
  /** Se la decisione è stata presa via LLM. */
  viaLLM?: boolean;
  reasoning?: string;
}

export async function route(_msg: LavagnaMessage): Promise<RouteResult> {
  throw new Error("Not implemented: route");
}

export async function routingIntelligente(_msg: LavagnaMessage): Promise<RouteResult> {
  throw new Error("Not implemented: routingIntelligente");
}

// ─── Workflow ───────────────────────────────────────────────────

export interface AvviaWorkflowInput {
  workflowId: string;
  triggerMsgId: string;
  contesto?: Record<string, unknown>;
}

export async function avviaWorkflow(_input: AvviaWorkflowInput): Promise<FlowInstance> {
  throw new Error("Not implemented: avviaWorkflow");
}

export async function avantiStep(_flowInstanceId: string): Promise<FlowInstance> {
  throw new Error("Not implemented: avantiStep");
}

export async function eseguiStep(
  _flowInstanceId: string,
  _stepId: string,
): Promise<FlowInstance> {
  throw new Error("Not implemented: eseguiStep");
}

// ─── Cron check ────────────────────────────────────────────────

export interface CheckPendingResult {
  eseguitoIl: string;
  esaminati: number;
  escalati: number;
  riasasegnati: number;
}

export async function checkPending(): Promise<CheckPendingResult> {
  throw new Error("Not implemented: checkPending");
}

export async function checkFlowTimeout(): Promise<{
  eseguitoIl: string;
  flowControllati: number;
  timeout: number;
  escalati: number;
}> {
  throw new Error("Not implemented: checkFlowTimeout");
}

// ─── Escalation ────────────────────────────────────────────────

export interface EscalateInput {
  flowInstanceId?: string;
  alertId?: string;
  motivo: string;
  canale?: "whatsapp" | "telegram" | "email" | "push";
}

export async function escalate(_input: EscalateInput): Promise<{ echoMsgId: string }> {
  throw new Error("Not implemented: escalate");
}

// ─── Stato flow ─────────────────────────────────────────────────

export async function flowAttivi(
  _opts: { workflowId?: string; limit?: number } = {},
): Promise<FlowInstance[]> {
  throw new Error("Not implemented: flowAttivi");
}

export interface FlowStoricoQuery {
  workflowId?: string;
  stato?: FlowInstance["stato"] | FlowInstance["stato"][];
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export async function flowStorico(_query: FlowStoricoQuery = {}): Promise<FlowInstance[]> {
  throw new Error("Not implemented: flowStorico");
}

export interface StatisticheFlow {
  workflowId?: string;
  esecuzioni: number;
  completati: number;
  falliti: number;
  escalati: number;
  successRatePct: number;
  durataMediaMin: number;
  durataP95Min?: number;
  finestra: { from: string; to: string };
}

export async function statisticheFlow(
  _finestra: { fromDate: string; toDate: string },
  _opts: { workflowId?: string } = {},
): Promise<StatisticheFlow> {
  throw new Error("Not implemented: statisticheFlow");
}

// ─── Routing rules ──────────────────────────────────────────────

export async function listaRoutingRules(
  _opts: { attive?: boolean } = {},
): Promise<RoutingRule[]> {
  throw new Error("Not implemented: listaRoutingRules");
}

export async function creaRoutingRule(_rule: Omit<RoutingRule, "id">): Promise<RoutingRule> {
  throw new Error("Not implemented: creaRoutingRule");
}

// ─── Escalation rules ──────────────────────────────────────────

export async function listaEscalationRules(
  _opts: { attive?: boolean } = {},
): Promise<EscalationRule[]> {
  throw new Error("Not implemented: listaEscalationRules");
}

export async function creaEscalationRule(_rule: Omit<EscalationRule, "id">): Promise<EscalationRule> {
  throw new Error("Not implemented: creaEscalationRule");
}

// ─── Workflows ──────────────────────────────────────────────────

export async function listaWorkflows(_opts: { attivi?: boolean } = {}): Promise<Workflow[]> {
  throw new Error("Not implemented: listaWorkflows");
}

export async function creaWorkflow(
  _workflow: Omit<Workflow, "id" | "createdAt" | "updatedAt">,
): Promise<Workflow> {
  throw new Error("Not implemented: creaWorkflow");
}
