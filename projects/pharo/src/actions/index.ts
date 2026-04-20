/**
 * PHARO — azioni esposte.
 *
 * Tutti gli stub lanciano "Not implemented". Le firme sono il contratto.
 */
import type {
  Alert,
  BudgetSnapshot,
  Heartbeat,
  HealthCheck,
  RegolaMonitoring,
  SeveritaAlert,
  TipoRegola,
} from "../types/index.js";

// ─── Health / heartbeat ─────────────────────────────────────────

export interface HeartbeatResult {
  eseguitoIl: string;
  servizi: Heartbeat[];
  problemi: Array<{ servizio: string; severita: SeveritaAlert; dettaglio: string }>;
}

export async function controlloHeartbeat(): Promise<HeartbeatResult> {
  throw new Error("Not implemented: controlloHeartbeat");
}

export async function statoSuite(): Promise<{
  eseguitoIl: string;
  punteggioGlobale: number;
  perCollega: Array<{ collega: string; punteggio: number; note?: string }>;
}> {
  throw new Error("Not implemented: statoSuite");
}

export async function reportSalute(
  _opts: { pdf?: boolean } = {},
): Promise<{ generatoIl: string; htmlInline?: string; pdfUrl?: string }> {
  throw new Error("Not implemented: reportSalute");
}

// ─── Budget / costi ────────────────────────────────────────────

export async function budgetAnthropic(_yyyymm: string): Promise<BudgetSnapshot> {
  throw new Error("Not implemented: budgetAnthropic");
}

export async function costiInfrastruttura(
  _finestra: { fromDate: string; toDate: string },
): Promise<{ firebase: number; hosting: number; altri: number; totale: number }> {
  throw new Error("Not implemented: costiInfrastruttura");
}

// ─── Pattern dimenticati ───────────────────────────────────────

export async function impiantiOrfani(
  _opts: { zona?: string; giorniSoglia?: number; limit?: number } = {},
): Promise<Array<{ impiantoId: string; condominio?: string; scadenzaPassata?: string; giorniDaScadenza: number }>> {
  throw new Error("Not implemented: impiantiOrfani");
}

export async function emailSenzaRisposta(
  _opts: { giorniSoglia?: number; limit?: number } = {},
): Promise<Array<{ emailId: string; mittente: string; oggetto: string; giorniAttesa: number; category?: string }>> {
  throw new Error("Not implemented: emailSenzaRisposta");
}

export async function interventiBloccati(
  _opts: { giorniSoglia?: number; limit?: number } = {},
): Promise<Array<{ interventoId: string; statoCorrente: string; giorniSenzaMovimento: number; tecnico?: string }>> {
  throw new Error("Not implemented: interventiBloccati");
}

export async function fattureNonInviate(
  _opts: { giorniSoglia?: number; limit?: number } = {},
): Promise<Array<{ fatturaId: string; importo: number; giorniInBozza: number }>> {
  throw new Error("Not implemented: fattureNonInviate");
}

export async function clientiSilenziosi(
  _opts: { mesi?: number; limit?: number } = {},
): Promise<Array<{ clienteId: string; nome?: string; giorniSilenzio: number; ultimoContatto?: string }>> {
  throw new Error("Not implemented: clientiSilenziosi");
}

// ─── Integrità dataset ─────────────────────────────────────────

export async function duplicatiDatabase(
  _opts: { collection?: string; soglia?: number; limit?: number } = {},
): Promise<Array<{ collection: string; groups: Array<{ docIds: string[]; motivo: string; confidence: number }> }>> {
  throw new Error("Not implemented: duplicatiDatabase");
}

// ─── Alert ─────────────────────────────────────────────────────

export interface AlertFilters {
  severita?: SeveritaAlert | SeveritaAlert[];
  stato?: Alert["stato"] | Alert["stato"][];
  regolaId?: string;
  limit?: number;
}

export async function alertAttivi(_filters: AlertFilters = {}): Promise<Alert[]> {
  throw new Error("Not implemented: alertAttivi");
}

export async function acknowledgeAlert(
  _alertId: string,
  _opts: { by?: string; nota?: string } = {},
): Promise<Alert> {
  throw new Error("Not implemented: acknowledgeAlert");
}

export async function risolviAlert(
  _alertId: string,
  _opts: { by?: string; risoluzione?: string } = {},
): Promise<Alert> {
  throw new Error("Not implemented: risolviAlert");
}

export async function silenziaAlert(
  _alertId: string,
  _finoA: string,
  _opts: { by?: string; motivo?: string } = {},
): Promise<Alert> {
  throw new Error("Not implemented: silenziaAlert");
}

// ─── Regole ────────────────────────────────────────────────────

export async function listaRegole(
  _opts: { attive?: boolean; tipo?: TipoRegola } = {},
): Promise<RegolaMonitoring[]> {
  throw new Error("Not implemented: listaRegole");
}

export interface CreaRegolaInput {
  nome: string;
  tipo: TipoRegola;
  descrizione?: string;
  intervalSec: number;
  parametri?: Record<string, unknown>;
  severitaDefault?: SeveritaAlert;
  attiva?: boolean;
}

export async function creaRegola(_input: CreaRegolaInput): Promise<RegolaMonitoring> {
  throw new Error("Not implemented: creaRegola");
}

// ─── Cron entry-point ──────────────────────────────────────────

export interface ControlliPeriodiciResult {
  eseguitiIl: string;
  regoleEseguite: number;
  alertGenerati: number;
  alertSilenziati: number;
  durataMs: number;
  checks: HealthCheck[];
}

export async function eseguiControlliPeriodici(): Promise<ControlliPeriodiciResult> {
  throw new Error("Not implemented: eseguiControlliPeriodici");
}
