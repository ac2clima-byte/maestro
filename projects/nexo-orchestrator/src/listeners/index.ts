/**
 * Orchestrator — listener Lavagna.
 *
 * Ascolta `nexo_lavagna` con `to == "orchestrator"` e, in modalità
 * trigger, onCreate globale per far partire workflow su messaggi che
 * matchano un trigger di workflow.
 *
 * Inoltre tramite cron ascolta `checkPending` (messaggi pending da troppo
 * tempo) e `checkFlowTimeout` (flow in corso scaduti).
 *
 * Stub: contratto + dispatcher non implementato.
 */

export const ORCHESTRATOR_INBOUND_TYPES = [
  // In realtà l'orchestrator ascolta QUALSIASI tipo se `to == "orchestrator"`.
  // Questi sono i cluster semantici che ci aspettiamo di gestire.
  "routing_richiesto",
  "avvio_workflow",
  "conflitto",
  "escalation_richiesta",
] as const;

export type OrchestratorInboundType = (typeof ORCHESTRATOR_INBOUND_TYPES)[number];

export interface LavagnaIncoming {
  id: string;
  from: string;
  to: "orchestrator";
  type: OrchestratorInboundType | string;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "critical";
  sourceEmailId?: string;
  parentMessageId?: string;
}

export function startLavagnaListener(): () => void {
  throw new Error("Not implemented: startLavagnaListener");
}

export async function dispatch(_msg: LavagnaIncoming): Promise<boolean> {
  throw new Error("Not implemented: dispatch");
}
