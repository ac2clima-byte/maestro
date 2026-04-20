#!/usr/bin/env node
/**
 * test-send-wa.js — invia un WhatsApp di prova via ECHO.
 *
 * Modalità (selezionate da env):
 *   ECHO_DRY_RUN=true   (default)  → nessuna chiamata Waha, dump locale.
 *   ECHO_DRY_RUN=false              → invio reale (richiede whitelist
 *                                      o flag --force).
 *
 * Numero destinatario: ECHO_TEST_PHONE oppure 1° argomento CLI.
 * Testo:               ECHO_TEST_BODY  oppure 2° argomento CLI o default.
 *
 * Esempi:
 *   # dry-run (sicuro)
 *   ECHO_DRY_RUN=true ECHO_TEST_PHONE=+393331234567 \
 *     node projects/echo/scripts/test-send-wa.js
 *
 *   # invio reale ad Alberto (numero in whitelist)
 *   ECHO_DRY_RUN=false ECHO_ALLOWED_NUMBERS=+393331234567 \
 *     ECHO_TEST_PHONE=+393331234567 \
 *     node projects/echo/scripts/test-send-wa.js "Test ECHO NEXO"
 */
import "dotenv/config";

// importa azione dal codice TS già implementato
const { sendWhatsApp, normalizeWhatsappAddress, loadWahaConfig } = await import(
  "../src/actions/index.ts"
).catch(async () => {
  // Fallback: se manca tsx, importo direttamente .ts via node esm-loader
  return await import("../dist/actions/index.js");
});

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[36m${s}\x1b[0m`,
  d: (s) => `\x1b[90m${s}\x1b[0m`,
};

const phone = process.argv[2] || process.env.ECHO_TEST_PHONE || "";
const body =
  process.argv[3] || process.env.ECHO_TEST_BODY || "Test ECHO NEXO 🚀";

if (!phone) {
  console.error(C.r("ERRORE: ECHO_TEST_PHONE non impostato (o passare numero come 1° arg)."));
  console.error(C.d("  esempio: node test-send-wa.js +393331234567 'Ciao'"));
  process.exit(2);
}

const dry = (process.env.ECHO_DRY_RUN ?? process.env.DRY_RUN ?? "true")
  .toLowerCase() === "true";
const wlRaw = process.env.ECHO_ALLOWED_NUMBERS || "";

console.log(C.b("─── ECHO sendWhatsApp test ───"));
console.log(C.d(`  destinatario: ${phone} → ${normalizeWhatsappAddress(phone)}`));
console.log(C.d(`  testo:        "${body.slice(0, 60)}${body.length > 60 ? "…" : ""}"`));
console.log(C.d(`  modalità:     ${dry ? C.y("DRY-RUN (nessun invio)") : C.r("LIVE (invio reale)")}`));
console.log(C.d(`  whitelist:    ${wlRaw || "(vuota → tutti ammessi)"}`));

// 1. Probe config Waha (utile per debug separato dal send)
try {
  const cfg = await loadWahaConfig();
  console.log(C.d(`  waha url:     ${cfg.url}`));
  console.log(C.d(`  waha session: ${cfg.session}`));
  console.log(C.d(`  waha apiKey:  ${cfg.apiKey ? "***SET***" : "(none)"}`));
  console.log(C.d(`  waha enabled: ${cfg.enabled}`));
} catch (e) {
  console.warn(C.y(`  waha config:  NON DISPONIBILE — ${e.message}`));
}

console.log("");

// 2. Send
const t0 = Date.now();
let res;
try {
  res = await sendWhatsApp(phone, body);
} catch (e) {
  console.error(C.r(`✗ ECCEZIONE: ${e.message || e}`));
  process.exit(1);
}
const ms = Date.now() - t0;

console.log(C.b("─── Risultato ───"));
console.log(JSON.stringify(res, null, 2));
console.log("");

const status = res.status;
if (status === "sent") {
  console.log(C.g(`✓ INVIATO in ${ms}ms`));
  process.exit(0);
} else if (status === "skipped") {
  console.log(C.y(`⊘ SKIPPED (${res.failedReason || "nessun motivo"}) in ${ms}ms`));
  console.log(C.d("  Comportamento atteso se ECHO_DRY_RUN=true o whitelist."));
  process.exit(0);
} else {
  console.log(C.r(`✗ FALLITO (${res.failedReason || "?"}) in ${ms}ms`));
  process.exit(1);
}
