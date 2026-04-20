/**
 * CALLIOPE — entry point.
 *
 * Inizializza Firebase Admin (progetto `nexo-hub-15f2d`), espone Firestore
 * per le azioni, e (in modalità non-test) avvierà il listener Lavagna
 * quando implementato.
 */
import { config as loadDotenv } from "dotenv";
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

loadDotenv();

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
export const LLM_MODEL = process.env.LLM_MODEL || "claude-sonnet-4-5";
export const GRAPH_API_URL = process.env.GRAPH_API_URL || "https://graph-acg.web.app/api/v1/generate";
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
  bozze: "calliope_bozze",
  template: "calliope_template",
  stili: "calliope_stili",
  lavagna: "nexo_lavagna",
} as const;

export * from "./types/index.js";
export * as actions from "./actions/index.js";
export * as listeners from "./listeners/index.js";

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // eslint-disable-next-line no-console
  console.log(
    `[calliope] init project=${PROJECT_ID} model=${LLM_MODEL} ` +
    `graphApi=${GRAPH_API_URL} dryRun=${DRY_RUN}`,
  );
  // eslint-disable-next-line no-console
  console.log("[calliope] listeners non avviati (stub). Implementare startLavagnaListener().");
}
