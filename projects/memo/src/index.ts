/**
 * MEMO — entry point.
 *
 * MEMO legge da TRE progetti Firebase:
 *  · nexo-hub-15f2d    (default)  → `memo_dossier`, `memo_cache`,
 *                                    `nexo_lavagna`, `iris_emails`.

 *  · garbymobile-f89ac (cosmina)  → `crm_clienti`, `cosmina_impianti`,
 *                                    `cosmina_interventi_pianificati`,
 *                                    `trello_boards` (sub-collection `cards`).
 *  · guazzotti-energia (guazzotti) → `rti`, `pagamenti_clienti`,
 *                                     `commesse`.
 *
 * Ogni app Firebase è inizializzata lazy con un `name` distinto (la
 * default resta l'app NEXO). Le credenziali arrivano da
 * Application Default (chi esegue deve avere Firestore Read su tutti
 * e tre).
 *
 * Attenzione per la Cloud Function: il Service Account di default
 * delle function non ha accesso a `garbymobile-f89ac` né a
 * `guazzotti-energia`. L'handler NEXUS cross-progetto va
 * abilitato a mano (IAM → Firestore Viewer) oppure tenuto su
 * nexo-hub leggendo solo `iris_emails` (fallback v0.1).
 */
import { config as loadDotenv } from "dotenv";
import {
  initializeApp,
  getApps,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

loadDotenv();

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
/** Default corretto: COSMINA vive sul project Firebase `garbymobile-f89ac`
 *  (vedi acg_suite/CLAUDE.md — "acg-clima-service" era un nome interno
 *  dei task NEXO, non il project ID reale). */
export const COSMINA_PROJECT_ID =
  process.env.COSMINA_PROJECT_ID || "garbymobile-f89ac";
export const GUAZZOTTI_PROJECT_ID =
  process.env.GUAZZOTTI_PROJECT_ID || "guazzotti-energia";
export const DRY_RUN =
  (process.env.DRY_RUN || "false").toLowerCase() === "true";

/** TTL della cache dossier (ms). Default 1h. */
export const DOSSIER_CACHE_TTL_MS =
  Number(process.env.DOSSIER_CACHE_TTL_MS) || 60 * 60 * 1000;

export const DISCO_PATHS = {
  N: process.env.DISCO_N_PATH || "/mnt/n",
  I: process.env.DISCO_I_PATH || "/mnt/i",
  L: process.env.DISCO_L_PATH || "/mnt/l",
  M: process.env.DISCO_M_PATH || "/mnt/m",
} as const;

// ─── App singleton (per nome) ──────────────────────────────────

function getOrInit(name: string, projectId: string): App {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  // "default" app non ha nome — lo trattiamo a parte
  if (name === "[DEFAULT]") {
    return initializeApp({
      credential: applicationDefault(),
      projectId,
    });
  }
  return initializeApp(
    { credential: applicationDefault(), projectId },
    name,
  );
}

export function getApp(): App {
  return getOrInit("[DEFAULT]", PROJECT_ID);
}
export function db(): Firestore {
  return getFirestore(getApp());
}

export function getCosminaApp(): App {
  return getOrInit("cosmina", COSMINA_PROJECT_ID);
}
export function cosminaDb(): Firestore {
  return getFirestore(getCosminaApp());
}

export function getGuazzottiApp(): App {
  return getOrInit("guazzotti", GUAZZOTTI_PROJECT_ID);
}
export function guazzottiDb(): Firestore {
  return getFirestore(getGuazzottiApp());
}

export const COLLECTIONS = {
  dossier: "memo_dossier",
  cache: "memo_cache",
  lavagna: "nexo_lavagna",
} as const;

export const COSMINA_COLLECTIONS = {
  clienti: "crm_clienti",
  impianti: "cosmina_impianti",
  impiantiCit: "cosmina_impianti_cit",
  interventi: "cosmina_interventi_pianificati",
  boards: "trello_boards",
  bacheca: "bacheca_cards",
  config: "cosmina_config",
  users: "acg_users",
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
  console.log(
    `[memo] dischi N=${DISCO_PATHS.N} I=${DISCO_PATHS.I} L=${DISCO_PATHS.L} M=${DISCO_PATHS.M}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    "[memo] listeners non avviati (call startLavagnaListener()).",
  );
}
