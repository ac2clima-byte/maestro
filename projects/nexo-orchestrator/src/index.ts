/**
 * NEXO Orchestrator — entry point.
 *
 * Inizializza Firebase Admin (progetto `nexo-hub-15f2d`), espone Firestore
 * per le azioni, e (in modalità non-test) avvierà il listener Lavagna e
 * i cron `checkPending` / `checkFlowTimeout` quando implementati.
 */
import { config as loadDotenv } from "dotenv";
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

loadDotenv();

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
export const LLM_MODEL = process.env.LLM_MODEL || "claude-haiku-4-5";
export const PENDING_TIMEOUT_MINUTES = Number(process.env.PENDING_TIMEOUT_MINUTES || "30");
export const ESCALATION_CHANNEL = process.env.ESCALATION_CHANNEL || "whatsapp";
export const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";

let _app: App | null = null;
let _db: Firestore | null = null;

export function getApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0]!;
    return _app;
  }
  _app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
  return _app;
}

export function db(): Firestore {
  if (_db) return _db;
  _db = getFirestore(getApp());
  return _db;
}

export const COLLECTIONS = {
  log: "nexo_orchestrator_log",
  workflows: "nexo_workflows",
  workflowInstances: "nexo_workflow_instances",
  routingRules: "nexo_routing_rules",
  escalationRules: "nexo_escalation_rules",
  lavagna: "nexo_lavagna",
} as const;

export * from "./types/index.js";
export * as actions from "./actions/index.js";
export * as listeners from "./listeners/index.js";

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // eslint-disable-next-line no-console
  console.log(
    `[orchestrator] init project=${PROJECT_ID} model=${LLM_MODEL} ` +
    `pendingTimeout=${PENDING_TIMEOUT_MINUTES}m escalationChannel=${ESCALATION_CHANNEL} ` +
    `dryRun=${DRY_RUN}`,
  );
  // eslint-disable-next-line no-console
  console.log("[orchestrator] cron non avviato (stub). Implementare checkPending/checkFlowTimeout.");
}
