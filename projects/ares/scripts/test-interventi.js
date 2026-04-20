#!/usr/bin/env node
/**
 * test-interventi.js — smoke test ARES v0.1.
 *
 * 1) interventiAperti() — LETTURA reale da COSMINA, sempre attiva.
 * 2) apriIntervento(...) — SCRITTURA in DRY-RUN (default).
 *
 * Esempi:
 *   # Solo lettura
 *   node projects/ares/scripts/test-interventi.js list
 *
 *   # Apertura intervento dry-run (default)
 *   node projects/ares/scripts/test-interventi.js apri
 *
 *   # Apertura reale (richiede ARES_DRY_RUN=false)
 *   ARES_DRY_RUN=false ARES_ALLOWED_TIPI=manutenzione \
 *     node projects/ares/scripts/test-interventi.js apri
 */
import "dotenv/config";

const { interventiAperti, apriIntervento } = await import("../src/actions/index.ts");

const C = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  b: (s) => `\x1b[36m${s}\x1b[0m`,
  d: (s) => `\x1b[90m${s}\x1b[0m`,
};

const cmd = process.argv[2] || "list";

async function doList() {
  console.log(C.b("─── interventiAperti() ───"));
  const t0 = Date.now();
  try {
    const list = await interventiAperti({ limit: 20 });
    const ms = Date.now() - t0;
    console.log(C.g(`✓ ${list.length} interventi attivi in ${ms}ms`));
    for (const i of list.slice(0, 10)) {
      const when = i.dataPianificata ? new Date(i.dataPianificata).toLocaleDateString("it-IT") : "n.d.";
      console.log(C.d(`  - [${i.urgenza}] ${i.tipo} · ${i.stato} · ${when} · ${i.condominio || i.indirizzo || "?"} · tecnico=${i.tecnico || "-"}`));
    }
  } catch (e) {
    console.error(C.r(`✗ ERRORE: ${e.message || e}`));
    process.exit(1);
  }
}

async function doApri() {
  const dry = (process.env.ARES_DRY_RUN ?? process.env.DRY_RUN ?? "true").toLowerCase() === "true";
  console.log(C.b("─── apriIntervento() ───"));
  console.log(C.d(`  modalità: ${dry ? C.y("DRY-RUN (no write COSMINA)") : C.r("LIVE (scrive in produzione)")}`));
  console.log(C.d(`  whitelist tipi: ${process.env.ARES_ALLOWED_TIPI || "(vuota)"}`));
  console.log("");

  const t0 = Date.now();
  try {
    const i = await apriIntervento({
      tipo: "manutenzione",
      urgenza: "bassa",
      indirizzo: "Via Test 1, Alessandria",
      condominio: "TEST_DRY_RUN_DA_NEXO",
      note: "Intervento di test creato da scripts/test-interventi.js",
    });
    const ms = Date.now() - t0;
    console.log(C.b(`Risultato (${ms}ms):`));
    console.log(JSON.stringify(i, null, 2));
    if (i.id.startsWith("dryrun_")) {
      console.log(C.y("\n⊘ DRY-RUN: nessun write su cosmina_interventi_pianificati."));
    } else {
      console.log(C.g(`\n✓ Intervento creato in COSMINA con id: ${i.id}`));
    }
  } catch (e) {
    console.error(C.r(`✗ ERRORE: ${e.message || e}`));
    process.exit(1);
  }
}

if (cmd === "list") await doList();
else if (cmd === "apri") await doApri();
else {
  console.log("Comandi: list | apri");
  process.exit(2);
}
