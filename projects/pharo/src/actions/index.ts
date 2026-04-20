/**
 * PHARO — azioni esposte.
 *
 * v0.1 implementato:
 *   · statoSuite()          — health check: verifica che Firestore risponda,
 *                             conta alert aperti.
 *   · emailSenzaRisposta()  — query iris_emails per follow-up >48h.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type {
  Alert,
  BudgetSnapshot,
  Heartbeat,
  HealthCheck,
  RegolaMonitoring,
  SeveritaAlert,
  TipoRegola,
} from "../types/index.js";

const NEXO_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";

function getOrInit(name: string, projectId: string): App {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (name === "[DEFAULT]") {
    return initializeApp({ credential: applicationDefault(), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId }, name);
}
function nexoDb(): Firestore {
  return getFirestore(getOrInit("[DEFAULT]", NEXO_PROJECT_ID));
}

// ─── Health / heartbeat ─────────────────────────────────────────

export interface HeartbeatResult {
  eseguitoIl: string;
  servizi: Heartbeat[];
  problemi: Array<{ servizio: string; severita: SeveritaAlert; dettaglio: string }>;
}

export async function controlloHeartbeat(): Promise<HeartbeatResult> {
  throw new Error("Not implemented: controlloHeartbeat");
}

/**
 * Health check base:
 *   - Verifica che Firestore risponda (latenza)
 *   - Conta messaggi Lavagna "pending" e errori
 *   - Conta email senza risposta >48h
 *   - Punteggio: 100 – (pending * 2) – (errori * 5) – (senza_risp * 1), clamped [0,100]
 */
export async function statoSuite(): Promise<{
  eseguitoIl: string;
  punteggioGlobale: number;
  perCollega: Array<{ collega: string; punteggio: number; note?: string }>;
}> {
  const eseguitoIl = new Date().toISOString();
  const db = nexoDb();
  let pending = 0, errori = 0, emailAttesa = 0, emails = 0, firestoreOk = true;

  try {
    const snap = await db.collection("nexo_lavagna")
      .orderBy("createdAt", "desc").limit(100).get();
    snap.forEach((d) => {
      const s = (d.data() || {}).status;
      if (s === "pending" || s === "in_progress") pending++;
      else if (s === "failed" || s === "error" || s === "errore") errori++;
    });
  } catch { firestoreOk = false; }

  try {
    const snap = await db.collection("iris_emails")
      .orderBy("raw.received_time", "desc").limit(500).get();
    snap.forEach((d) => {
      emails++;
      const f = (d.data() || {}).followup;
      if (f && f.needsAttention) emailAttesa++;
    });
  } catch { firestoreOk = false; }

  const punteggioGlobale = firestoreOk
    ? Math.max(0, Math.min(100, 100 - pending * 2 - errori * 5 - emailAttesa))
    : 0;

  const perCollega = [
    { collega: "iris", punteggio: firestoreOk ? Math.max(0, 100 - emailAttesa) : 0,
      note: `${emails} email, ${emailAttesa} senza risposta >48h` },
    { collega: "nexus", punteggio: firestoreOk ? Math.max(0, 100 - errori * 10) : 0,
      note: `${pending} lavagna pending, ${errori} errori` },
  ];

  if (!firestoreOk) {
    perCollega.push({ collega: "firestore", punteggio: 0, note: "Firestore non risponde" });
  }

  return { eseguitoIl, punteggioGlobale, perCollega };
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

/**
 * Query iris_emails per email che IRIS ha marcato `followup.needsAttention`.
 * Filtra per giorniSoglia se specificato.
 */
export async function emailSenzaRisposta(
  opts: { giorniSoglia?: number; limit?: number } = {},
): Promise<Array<{ emailId: string; mittente: string; oggetto: string; giorniAttesa: number; category?: string }>> {
  const limit = opts.limit ?? 50;
  const soglia = opts.giorniSoglia ?? 0;

  const snap = await nexoDb().collection("iris_emails")
    .orderBy("raw.received_time", "desc").limit(500).get();

  const out: Array<{ emailId: string; mittente: string; oggetto: string; giorniAttesa: number; category?: string }> = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const f = data.followup;
    if (!f || !f.needsAttention) return;
    const giorni = Number(f.daysWithoutReply || 0);
    if (giorni < soglia) return;
    const raw = data.raw || {};
    out.push({
      emailId: d.id,
      mittente: raw.sender_name || raw.sender || "?",
      oggetto: raw.subject || "(senza oggetto)",
      giorniAttesa: giorni,
      category: (data.classification || {}).category,
    });
  });

  out.sort((a, b) => b.giorniAttesa - a.giorniAttesa);
  return out.slice(0, limit);
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
