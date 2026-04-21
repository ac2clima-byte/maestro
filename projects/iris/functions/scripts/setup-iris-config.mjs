#!/usr/bin/env node
/**
 * setup-iris-config.mjs — one-shot setup del documento cosmina_config/iris_config.
 *
 * USO (locale, con ADC gcloud già autenticate su garbymobile-f89ac):
 *
 *   export IRIS_USER="alberto.contardi@acgclimaservice.com"
 *   export IRIS_PASSWORD="..."
 *   export IRIS_SERVER="https://mail.example.com/EWS/Exchange.asmx"
 *   export IRIS_ADMIN_KEY="$(openssl rand -hex 24)"     # per /irisPollerRun
 *   node projects/iris/functions/scripts/setup-iris-config.mjs
 *
 * Dopo, per forzare un primo run:
 *   curl -X POST \
 *     -H "X-Admin-Key: $IRIS_ADMIN_KEY" \
 *     https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/irisPollerRun
 *
 * Oppure aspetta 5 minuti e controlla i log:
 *   firebase functions:log --only irisPoller --project nexo-hub-15f2d -n 30
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

if (!process.env.IRIS_USER || !process.env.IRIS_PASSWORD || !process.env.IRIS_SERVER) {
  console.error("Missing env: IRIS_USER / IRIS_PASSWORD / IRIS_SERVER");
  process.exit(1);
}

admin.initializeApp({ projectId: "garbymobile-f89ac" });
const db = admin.firestore();

const ref = db.collection("cosmina_config").doc("iris_config");
await ref.set({
  enabled: true,
  auth: "basic",
  user: process.env.IRIS_USER,
  password: process.env.IRIS_PASSWORD,
  server: process.env.IRIS_SERVER,
  exchange_version: process.env.IRIS_VERSION || "2013_SP1",
  limit_per_run: Number(process.env.IRIS_LIMIT) || 50,
  initial_lookback_hours: Number(process.env.IRIS_LOOKBACK_HOURS) || 24,
  admin_key: process.env.IRIS_ADMIN_KEY || null,
  updated_at: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });

console.log("✅ cosmina_config/iris_config aggiornato");
console.log("   user:", process.env.IRIS_USER);
console.log("   server:", process.env.IRIS_SERVER);
console.log("   limit_per_run:", Number(process.env.IRIS_LIMIT) || 50);
console.log("   initial_lookback_hours:", Number(process.env.IRIS_LOOKBACK_HOURS) || 24);

process.exit(0);
