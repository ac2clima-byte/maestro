/**
 * MEMO — entry point.
 *
 * Inizializza Firebase Admin (progetto `nexo-hub-15f2d`), espone Firestore
 * per le azioni, e (in modalità non-test) avvierà il listener Lavagna
 * quando implementato.
 *
 * Note: MEMO legge anche da progetti COSMINA / Guazzotti — quelle App
 * vengono inizializzate lazy nelle azioni che le usano (non qui),
 * passando `name` distinto a `initializeApp`.
 */
import { config as loadDotenv } from "dotenv";
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

loadDotenv();

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
export const COSMINA_PROJECT_ID = process.env.COSMINA_PROJECT_ID || "acg-clima-service";
export const GUAZZOTTI_PROJECT_ID = process.env.GUAZZOTTI_PROJECT_ID || "guazzotti-tec";
export const DRY_RUN = (process.env.DRY_RUN || "false").toLowerCase() === "true";

export const DISCO_PATHS = {
  N: process.env.DISCO_N_PATH || "/mnt/n",
  I: process.env.DISCO_I_PATH || "/mnt/i",
  L: process.env.DISCO_L_PATH || "/mnt/l",
  M: process.env.DISCO_M_PATH || "/mnt/m",
} as const;

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
  dossier: "memo_dossier",
  cache: "memo_cache",
  lavagna: "nexo_lavagna",
} as const;

export * from "./types/index.js";
export * as actions from "./actions/index.js";
export * as listeners from "./listeners/index.js";

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // eslint-disable-next-line no-console
  console.log(
    `[memo] init project=${PROJECT_ID} cosmina=${COSMINA_PROJECT_ID} ` +
    `guazzotti=${GUAZZOTTI_PROJECT_ID} dryRun=${DRY_RUN}`,
  );
  // eslint-disable-next-line no-console
  console.log(`[memo] dischi N=${DISCO_PATHS.N} I=${DISCO_PATHS.I} L=${DISCO_PATHS.L} M=${DISCO_PATHS.M}`);
  // eslint-disable-next-line no-console
  console.log("[memo] listeners non avviati (stub). Implementare startLavagnaListener().");
}
