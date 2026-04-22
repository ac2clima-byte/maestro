// handlers/ares.js — interventi (lettura + scrittura).
import { getCosminaDb, db, FieldValue, logger } from "./shared.js";

export async function handleAresInterventiAperti(parametri) {
  const limit = Math.min(Number(parametri.limit) || 20, 50);
  const tecnicoFilter = String(parametri.tecnico || "").trim().toLowerCase();
  const oggiFlag = /oggi|today|giorno/.test(JSON.stringify(parametri).toLowerCase());

  let snap;
  try {
    let q = getCosminaDb().collection("bacheca_cards")
      .where("listName", "==", "INTERVENTI")
      .where("inBacheca", "==", true)
      .limit(limit * 3);
    snap = await q.get();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/permission|denied|UNAUTHENTICATED|403/i.test(msg)) {
      return {
        content:
          `ARES non riesce a leggere COSMINA dalla Cloud Function: il Service ` +
          `Account non ha ancora i permessi cross-progetto su garbymobile-f89ac. ` +
          `Per attivare:\n\n  gcloud projects add-iam-policy-binding garbymobile-f89ac \\\n` +
          `    --member=serviceAccount:272099489624-compute@developer.gserviceaccount.com \\\n` +
          `    --role=roles/datastore.user`,
      };
    }
    throw e;
  }

  const items = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const stato = String(data.stato || "").toLowerCase();
    if (stato.includes("complet") || stato.includes("annul")) return;
    let tecnico = data.techName;
    if (!tecnico && Array.isArray(data.techNames) && data.techNames.length) {
      tecnico = String(data.techNames[0]);
    }
    if (tecnicoFilter && !String(tecnico || "").toLowerCase().includes(tecnicoFilter)) return;

    let due;
    if (data.due) {
      try {
        const v = data.due.toDate ? data.due.toDate() : new Date(data.due);
        if (!Number.isNaN(v.getTime())) due = v;
      } catch {}
    }
    if (oggiFlag && due) {
      const today = new Date();
      const sameDay = due.getFullYear() === today.getFullYear()
        && due.getMonth() === today.getMonth()
        && due.getDate() === today.getDate();
      if (!sameDay) return;
    }
    items.push({
      id: d.id,
      condominio: data.boardName || "?",
      stato: stato || "aperto",
      tecnico: tecnico || "-",
      due,
      name: data.name || "(senza titolo)",
    });
  });

  items.sort((a, b) => {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.getTime() - b.due.getTime();
  });
  const top = items.slice(0, limit);

  if (!top.length) {
    return { content: oggiFlag
      ? "Nessun intervento programmato per oggi."
      : "Non ho trovato interventi attivi nella bacheca COSMINA." };
  }

  const lines = top.map((i, idx) => {
    const data = i.due ? i.due.toLocaleDateString("it-IT") : "n.d.";
    const tag = i.tecnico !== "-" ? `tecnico=${i.tecnico}` : "non assegnato";
    return `${idx + 1}. [${data}] ${i.condominio.slice(0, 50)} — ${i.stato} · ${tag}`;
  }).join("\n");

  const header = oggiFlag
    ? `🔧 Interventi di **oggi** (${top.length}):`
    : `🔧 **${top.length}** interventi attivi su COSMINA${items.length > top.length ? ` (mostro i primi ${top.length} di ${items.length})` : ""}:`;
  return { content: `${header}\n\n${lines}`, data: { count: top.length } };
}

async function isAresDryRun() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("ares_config").get();
    if (snap.exists && typeof (snap.data() || {}).dry_run === "boolean") {
      return snap.data().dry_run;
    }
  } catch {}
  return true;
}

function aresIntId() {
  return "int_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export async function handleAresApriIntervento(parametri, ctx) {
  const msg = String(ctx?.userMessage || "").toLowerCase();

  let condominio = String(
    parametri.condominio || parametri.cliente || parametri.indirizzo || parametri.dove || "",
  ).trim();
  const note = String(
    parametri.note || parametri.descrizione || parametri.problema || parametri.testo || "",
  ).trim();
  const tipoRaw = String(parametri.tipo || "").toLowerCase();
  const urgenzaRaw = String(parametri.urgenza || parametri.priorità || parametri.priority || "").toLowerCase();

  if (!condominio && msg) {
    const m = /(?:presso|per|al|alla|a|da)\s+(?:condominio\s+|condom\.\s+)?([A-Za-zÀ-ÿ][\w\sÀ-ÿ.,'\-]{2,60}?)(?:\s+(?:urgente|normale|subito|per|con|in|entro|per|$)|$)/i.exec(msg);
    if (m) condominio = m[1].trim();
  }

  let tipo = "manutenzione";
  if (tipoRaw.includes("ripar") || /ripar|guast/i.test(msg)) tipo = "riparazione";
  else if (tipoRaw.includes("install") || /install/i.test(msg)) tipo = "installazione";
  else if (tipoRaw.includes("sopral") || /sopral/i.test(msg)) tipo = "sopralluogo";

  let urgenza = "media";
  if (urgenzaRaw.includes("critic") || /critic|immediat|subito/i.test(msg)) urgenza = "critica";
  else if (urgenzaRaw.includes("alta") || urgenzaRaw === "high" || /urgent|priorit/i.test(msg)) urgenza = "alta";
  else if (urgenzaRaw.includes("bass") || /non.*urgent|basso|flessibil/i.test(msg)) urgenza = "bassa";

  if (!condominio) {
    return {
      content: "🔧 Per aprire un intervento mi serve il condominio/indirizzo.\n\n" +
        "Es. \"apri intervento riparazione caldaia al Condominio Kristal urgente\"",
    };
  }

  const id = aresIntId();
  const dry = await isAresDryRun();

  const cardName = (note || `${tipo} ${urgenza}`).slice(0, 80);
  const labels = [`tipo:${tipo}`, `urgenza:${urgenza}`, "source:nexus"];
  if (urgenza === "critica" || urgenza === "alta") labels.push("URGENTE");

  if (dry) {
    try {
      await db.collection("ares_interventi").doc(id).set({
        id, condominio, tipo, urgenza, note,
        stato: "aperto", source: "nexus",
        _dryRun: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.error("ares mirror failed", { error: String(e) });
    }
    return {
      content:
        `📝 Intervento **simulato** (ARES DRY_RUN)\n\n` +
        `  · Condominio: **${condominio}**\n` +
        `  · Tipo: ${tipo}\n` +
        `  · Urgenza: ${urgenza}${urgenza !== "media" ? " ⚠️" : ""}\n` +
        (note ? `  · Note: ${note}\n` : "") +
        `\nID: \`${id}\`. Per scrivere davvero su COSMINA, imposta \`cosmina_config/ares_config.dry_run = false\`.`,
      data: { id, dryRun: true },
    };
  }

  try {
    const cosmDb = getCosminaDb();
    const ref = cosmDb.collection("bacheca_cards").doc();
    await ref.set({
      name: cardName,
      boardName: condominio,
      desc: note || undefined,
      workDescription: note || undefined,
      listName: "INTERVENTI",
      inBacheca: true,
      archiviato: false,
      stato: "aperto",
      labels,
      source: "nexus_ares",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    try {
      await db.collection("ares_interventi").doc(ref.id).set({
        id: ref.id, cosmina_doc_id: ref.id,
        condominio, tipo, urgenza, note,
        stato: "aperto", source: "nexus",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {}

    return {
      content:
        `✅ Intervento **creato** su COSMINA\n\n` +
        `  · Condominio: **${condominio}**\n` +
        `  · Tipo: ${tipo} · Urgenza: ${urgenza}\n` +
        (note ? `  · Note: ${note}\n` : "") +
        `\nID: \`${ref.id}\` · Visibile nella bacheca interventi.`,
      data: { id: ref.id, cosminaDocId: ref.id, dryRun: false },
    };
  } catch (e) {
    const errMsg = String(e?.message || e).slice(0, 200);
    if (/permission|denied|403/i.test(errMsg)) {
      return { content: `❌ ARES non può scrivere su COSMINA: permessi insufficienti. ${errMsg}` };
    }
    return { content: `❌ ARES: scrittura fallita. ${errMsg}` };
  }
}
