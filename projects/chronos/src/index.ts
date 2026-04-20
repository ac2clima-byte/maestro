/**
 * CHRONOS — entry point.
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
export const ORE_LAVORATIVE_GIORNO = Number(process.env.ORE_LAVORATIVE_GIORNO || "8");
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
  agende: "chronos_agende",
  scadenze: "chronos_scadenze",
  campagne: "chronos_campagne",
  lavagna: "nexo_lavagna",
} as const;

export * from "./types/index.js";
export * as actions from "./actions/index.js";
export * as listeners from "./listeners/index.js";

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // eslint-disable-next-line no-console
  console.log(`[chronos] init project=${PROJECT_ID} dryRun=${DRY_RUN} oreGiorno=${ORE_LAVORATIVE_GIORNO}`);
  // eslint-disable-next-line no-console
  console.log("[chronos] listeners non avviati (stub). Implementare startLavagnaListener().");
}
