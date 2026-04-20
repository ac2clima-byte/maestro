/**
 * firebase-multi — inizializzazione multi-progetto Firebase Admin.
 *
 * NEXO gira su tre progetti Firebase distinti:
 *   - nexo-hub-15f2d    — collections NEXO (iris_*, ares_*, nexo_*, ecc.)
 *   - acg-clima-service — CRM COSMINA (cosmina_*, acg_users, magazzino_*)
 *   - guazzotti-energia — Guazzotti TEC (rti, pagamenti_clienti, ecc.)
 *
 * Ogni app è inizializzata una sola volta (singleton) e con un `name`
 * distinto per poter coesistere nel processo. Le credenziali arrivano
 * dall'environment (application default credentials o service account
 * esplicito in test).
 *
 * Override env: `FIREBASE_PROJECT_ID`, `COSMINA_PROJECT_ID`,
 * `GUAZZOTTI_PROJECT_ID`.
 */
import { initializeApp, getApps, getApp as adminGetApp, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// ─── Project IDs default (overridable via env) ──────────────────

export const NEXO_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
export const COSMINA_PROJECT_ID = process.env.COSMINA_PROJECT_ID || "acg-clima-service";
export const GUAZZOTTI_PROJECT_ID = process.env.GUAZZOTTI_PROJECT_ID || "guazzotti-energia";

// ─── App cache ──────────────────────────────────────────────────

const APP_NAMES = {
  nexo: "nexo",
  cosmina: "cosmina",
  guazzotti: "guazzotti",
} as const;

function getOrInit(name: string, projectId: string): App {
  // firebase-admin memorizza le app per nome: la riuso se già esiste.
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  return initializeApp(
    { credential: applicationDefault(), projectId },
    name,
  );
}

// ─── Public API ─────────────────────────────────────────────────

export interface FirebaseHandle {
  app: App;
  db: Firestore;
  projectId: string;
}

export function initNexo(): FirebaseHandle {
  const app = getOrInit(APP_NAMES.nexo, NEXO_PROJECT_ID);
  return { app, db: getFirestore(app), projectId: NEXO_PROJECT_ID };
}

export function initCosmina(): FirebaseHandle {
  const app = getOrInit(APP_NAMES.cosmina, COSMINA_PROJECT_ID);
  return { app, db: getFirestore(app), projectId: COSMINA_PROJECT_ID };
}

export function initGuazzotti(): FirebaseHandle {
  const app = getOrInit(APP_NAMES.guazzotti, GUAZZOTTI_PROJECT_ID);
  return { app, db: getFirestore(app), projectId: GUAZZOTTI_PROJECT_ID };
}

/** Ritorna l'handle di un progetto per nome logico. Utile nei test. */
export function initByName(which: "nexo" | "cosmina" | "guazzotti"): FirebaseHandle {
  switch (which) {
    case "nexo": return initNexo();
    case "cosmina": return initCosmina();
    case "guazzotti": return initGuazzotti();
  }
}

/** Per test: permette di re-inizializzare se qualcuno ha fatto deleteApp. */
export function _resetCacheForTests(): void {
  // firebase-admin non espone un reset; il test deve passare per
  // appName = default + chiamare deleteApp manualmente. Questo helper
  // serve solo da segnale documentale.
  void adminGetApp;
}
