/**
 * CHARTA — entry point.
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
export const COSMINA_PROJECT_ID = process.env.COSMINA_PROJECT_ID || "acg-clima-service";
export const GUAZZOTTI_PROJECT_ID = process.env.GUAZZOTTI_PROJECT_ID || "guazzotti-tec";
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
  fatture: "charta_fatture",
  pagamenti: "charta_pagamenti",
  scadenze: "charta_scadenze",
  ddt: "charta_ddt",
  riconciliazioni: "charta_riconciliazioni",
  reports: "charta_reports",
  lavagna: "nexo_lavagna",
} as const;

export * from "./types/index.js";
export * as actions from "./actions/index.js";
export * as listeners from "./listeners/index.js";

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // eslint-disable-next-line no-console
  console.log(
    `[charta] init project=${PROJECT_ID} cosmina=${COSMINA_PROJECT_ID} ` +
    `guazzotti=${GUAZZOTTI_PROJECT_ID} dryRun=${DRY_RUN}`,
  );
  // eslint-disable-next-line no-console
  console.log("[charta] listeners non avviati (stub). Implementare startLavagnaListener().");
}
