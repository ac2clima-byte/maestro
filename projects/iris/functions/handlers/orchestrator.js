// handlers/orchestrator.js — Workflow multi-step (guasto_urgente).
//
// Ascolta nexo_lavagna dove to=="orchestrator". Esegue workflow:
//   guasto_urgente:
//     1. MEMO.dossier(cliente) → contesto chi è
//     2. ARES.apriIntervento(urgenza=critica) → DRY_RUN
//     3. ECHO.sendWhatsApp(Alberto, "Guasto urgente: ...")
//
// Tutti gli step logati in nexo_orchestrator_log con stato/timestamp.
import { db, FieldValue, logger, sendPushNotification } from "./shared.js";
import { handleMemoDossier } from "./memo.js";
import { handleAresApriIntervento } from "./ares.js";
import { handleEchoWhatsApp } from "./echo.js";
import { handleCalliopeBozza } from "./calliope.js";
import { runPreventivoWorkflow } from "./preventivo.js";

function flowId() {
  return `flow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out;
  }
  return obj;
}

async function logStep(flowInstanceId, step) {
  try {
    await db.collection("nexo_orchestrator_log").doc(flowInstanceId)
      .collection("steps").add({
        ...sanitizeForFirestore(step),
        at: FieldValue.serverTimestamp(),
      });
  } catch (e) {
    logger.warn("orchestrator: step log failed", { error: String(e) });
  }
}

async function createFlow(type, triggerMsgId, payload) {
  const id = flowId();
  try {
    await db.collection("nexo_orchestrator_log").doc(id).set({
      id,
      type,
      status: "running",
      triggerLavagnaId: triggerMsgId,
      payload,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) { logger.warn("orchestrator: createFlow failed", { error: String(e) }); }
  return id;
}

async function finalizeFlow(id, status, summary) {
  try {
    await db.collection("nexo_orchestrator_log").doc(id).set({
      status,
      summary: sanitizeForFirestore(summary),
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) { logger.warn("orchestrator: finalize failed", { error: String(e) }); }
}

async function workflowGuastoUrgente({ flowInstanceId, payload, triggerMsgRef }) {
  const summary = { steps: [] };

  // Estrai cliente/descrizione dal payload
  const cliente = String(
    payload.cliente || payload.condominio || payload.destinatario || "",
  ).trim();
  const dettaglio = String(
    payload.testo || payload.descrizione || payload.problema || payload.sourceEmailSubject || "",
  ).trim();
  const sourceEmailId = payload.sourceEmailId || null;

  // STEP 1: MEMO dossier
  const step1Start = Date.now();
  let memoResult = null;
  let dossierText = null;
  try {
    if (cliente) {
      memoResult = await handleMemoDossier({ cliente }, { userMessage: "orchestrator: dossier guasto urgente" });
      dossierText = memoResult?.content || null;
    }
    const stepData = {
      step: 1, name: "memo_dossier",
      ok: true, ms: Date.now() - step1Start,
      result: {
        hasClient: !!cliente,
        totalMatches: memoResult?.data?.totalMatches,
        clientiFound: memoResult?.data?.clienti,
      },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 1, name: "memo_dossier", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step1Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
    // Continua con gli altri step
  }

  // STEP 2: ARES apri intervento (urgenza=critica)
  const step2Start = Date.now();
  let aresResult = null;
  try {
    aresResult = await handleAresApriIntervento(
      {
        condominio: cliente || "(da verificare — guasto urgente da email)",
        note: dettaglio,
        urgenza: "critica",
        tipo: "riparazione",
      },
      { userMessage: `guasto urgente ${cliente}` },
    );
    const stepData = {
      step: 2, name: "ares_apri_intervento",
      ok: true, ms: Date.now() - step2Start,
      result: {
        interventoId: aresResult?.data?.id,
        dryRun: aresResult?.data?.dryRun,
      },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 2, name: "ares_apri_intervento", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step2Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  // STEP 3: ECHO notifica Alberto
  const step3Start = Date.now();
  try {
    const interventoId = aresResult?.data?.id || "(nessuno)";
    const testo =
      `🚨 Guasto urgente${cliente ? ` — ${cliente}` : ""}.` +
      (dettaglio ? ` Dettaglio: ${dettaglio.slice(0, 100)}.` : "") +
      ` Intervento aperto: ${interventoId}. Verifica dashboard ARES.`;

    const echoResult = await handleEchoWhatsApp(
      { to: "Alberto", body: testo, sessionId: flowInstanceId },
      { userMessage: `orchestrator guasto urgente ${cliente}` },
    );
    const stepData = {
      step: 3, name: "echo_notify_alberto",
      ok: true, ms: Date.now() - step3Start,
      result: {
        dryRun: echoResult?.data?.dryRun,
        resolvedFrom: echoResult?.data?.resolvedFrom,
      },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 3, name: "echo_notify_alberto", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step3Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  return summary;
}

// ─── Workflow: preventivo ──────────────────────────────────────
//
// Trigger: intent == "preparare_preventivo" nella Lavagna, payload con
// cliente/condominio + committente (azienda destinataria).
//
// Step 1 — MEMO: cerca condominio nel CRM.
// Step 2 — MEMO: cerca azienda committente (se non presente, flagga "nuovo contatto").
// Step 3 — CALLIOPE: genera bozza preventivo con anagrafica.
// Step 4 — Push notification ad Alberto (review in PWA).
// Step 5 — Stato "attesa_approvazione" sulla Lavagna. L'invio effettivo via
//          ECHO avviene in un secondo turno quando Alberto approva via chat.
async function workflowPreventivo({ flowInstanceId, payload }) {
  const summary = { steps: [] };

  const condominio = String(payload.condominio || payload.cliente || payload.destinatario_condominio || "").trim();
  const committente = String(payload.committente || payload.azienda || payload.intestazione || "").trim();
  const pIva = String(payload.piva || payload.p_iva || "").trim();
  const oggetto = String(payload.oggetto || payload.intervento || payload.note || "preventivo").trim();
  const sourceEmailId = payload.sourceEmailId || null;
  const sourceEmailSender = payload.sourceEmailSender || null;
  const threadPartecipanti = Array.isArray(payload.threadPartecipanti) ? payload.threadPartecipanti : [];

  // NUOVO: se arriva da IRIS auto-trigger, usa runPreventivoWorkflow (sincrono)
  // che fa arricchimento + CRM + CALLIOPE Sonnet + salva bozza.
  if (payload.triggeredBy === "iris_auto_intent" || payload.intent === "preparare_preventivo") {
    const tFull = Date.now();
    try {
      const userMsg = [
        `prepara preventivo`,
        condominio ? `per ${condominio}` : "",
        committente ? `intestato a ${committente}` : "",
        pIva ? `con P.IVA ${pIva}` : "",
        oggetto ? `per ${oggetto}` : "",
      ].filter(Boolean).join(" ");
      const ctx = {
        dati_estratti: payload.dati_estratti || null,
        sourceEmailId,
        sourceEmailSender,
        threadPartecipanti,
      };
      const r = await runPreventivoWorkflow({ userMessage: userMsg, context: ctx, sessionId: `iris_auto_${flowInstanceId}` });
      const stepData = {
        step: 1, name: "preventivo_workflow_sync", ok: !!r._preventivoReady, ms: Date.now() - tFull,
        result: { bozzaId: r.data?.bozzaId, numero: r.data?.preventivo?.numero, totale: r.data?.preventivo?.totale },
      };
      summary.steps.push(stepData);
      await logStep(flowInstanceId, stepData);

      // Push notification con preview
      if (r._preventivoReady && r.data?.bozzaId) {
        try {
          const prev = r.data.preventivo || {};
          const totale = typeof prev.totale === "number" ? `€${prev.totale.toFixed(2)}` : "—";
          const intest = (prev.intestatario || {}).ragione_sociale || committente || "?";
          const condStr = condominio || "cliente";
          await sendPushNotification(
            `📄 Preventivo ${condStr} pronto`,
            `Preventivo per ${intest} (${totale}). Apri NEXUS per approvare.`,
            `/#nexus/bozza/${r.data.bozzaId}`,
            null,
          );
        } catch (e) { logger.warn("push preventivo failed", { error: String(e).slice(0, 150) }); }
      }

      summary.pendingApproval = {
        bozzaId: r.data?.bozzaId,
        committente,
        condominio,
        sourceEmailId,
        threadPartecipanti,
        preventivoReady: !!r._preventivoReady,
      };
      return summary;
    } catch (e) {
      const stepData = { step: 1, name: "preventivo_workflow_sync", ok: false, error: String(e).slice(0, 300), ms: Date.now() - tFull };
      summary.steps.push(stepData);
      await logStep(flowInstanceId, stepData);
      // Cadi al vecchio flusso step-based sotto (fallback)
    }
  }

  // STEP 1: MEMO condominio
  const step1Start = Date.now();
  let dossierCondominio = null;
  try {
    if (condominio) {
      const r = await handleMemoDossier({ condominio }, { userMessage: `orchestrator: preventivo ${condominio}` });
      dossierCondominio = { content: r?.content || null, data: r?.data || null };
    }
    const stepData = {
      step: 1, name: "memo_condominio", ok: true, ms: Date.now() - step1Start,
      result: { condominio, totalMatches: dossierCondominio?.data?.totalMatches || 0 },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 1, name: "memo_condominio", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step1Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  // STEP 2: MEMO committente (o flag nuovo contatto)
  const step2Start = Date.now();
  let dossierCommittente = null;
  let committenteNuovo = false;
  try {
    if (committente) {
      const r = await handleMemoDossier({ cliente: committente }, { userMessage: `orchestrator: ricerca committente ${committente}` });
      const nMatches = r?.data?.totalMatches || 0;
      dossierCommittente = { content: r?.content || null, data: r?.data || null };
      committenteNuovo = nMatches === 0;
    }
    const stepData = {
      step: 2, name: "memo_committente", ok: true, ms: Date.now() - step2Start,
      result: { committente, pIva, nuovo: committenteNuovo, totalMatches: dossierCommittente?.data?.totalMatches || 0 },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 2, name: "memo_committente", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step2Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  // STEP 3: CALLIOPE bozza
  const step3Start = Date.now();
  let bozzaId = null, bozzaCorpo = null;
  try {
    const r = await handleCalliopeBozza(
      {
        tipo: "preventivo",
        cliente: committente || condominio,
        condominio,
        oggetto,
        tono: "formale",
        note: [
          committente && pIva ? `Intestazione: ${committente} (P.IVA ${pIva})` : committente ? `Intestazione: ${committente}` : "",
          condominio ? `Condominio oggetto: ${condominio}` : "",
        ].filter(Boolean).join(". "),
      },
      { userMessage: `orchestrator: genera preventivo per ${condominio || committente}` },
    );
    bozzaId = r?.data?.bozzaId || null;
    bozzaCorpo = r?.content || null;
    const stepData = {
      step: 3, name: "calliope_bozza_preventivo", ok: true, ms: Date.now() - step3Start,
      result: { bozzaId, committenteNuovo },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 3, name: "calliope_bozza_preventivo", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step3Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  // STEP 4: Push notification ad Alberto
  const step4Start = Date.now();
  try {
    const title = `Preventivo ${condominio || committente || "pronto"}`;
    const body = `Bozza preventivo generata${committente ? ` per ${committente}` : ""}${condominio ? ` (${condominio})` : ""}. Rivedi e approva.`;
    const link = `/#calliope/bozza/${bozzaId || ""}`;
    const pr = await sendPushNotification(title, body, link, null);
    const stepData = {
      step: 4, name: "push_notify_alberto", ok: pr.ok || pr.sent > 0, ms: Date.now() - step4Start,
      result: { sent: pr.sent, failed: pr.failed, errors: (pr.errors || []).slice(0, 3) },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 4, name: "push_notify_alberto", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step4Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  // STEP 5: Stato in attesa approvazione (la Lavagna resta "in_progress"
  // con il bozzaId. L'invio effettivo via ECHO viene eseguito dall'approvazione
  // utente gestita in workflowPreventivoApprovazione (chiamata da NEXUS chat
  // con un nuovo messaggio Lavagna type=preventivo_approvazione).
  summary.pendingApproval = {
    bozzaId,
    committente,
    condominio,
    sourceEmailId,
    threadPartecipanti,
  };

  return summary;
}

/**
 * Seconda fase del workflow preventivo — eseguita quando Alberto scrive
 * "approva" o "ok invia" oppure "rifiuta" in NEXUS Chat (Lavagna type
 * "preventivo_approvazione").
 */
async function workflowPreventivoApprovazione({ flowInstanceId, payload }) {
  const summary = { steps: [] };
  const azione = String(payload.azione || payload.decisione || "").toLowerCase();
  const bozzaId = String(payload.bozzaId || "").trim();
  const destinatario = String(payload.destinatario || payload.to || "").trim();
  const cc = Array.isArray(payload.cc) ? payload.cc : [];

  if (/rifiut|scart|annull/.test(azione)) {
    const stepData = { step: 1, name: "preventivo_rifiutato", ok: true, result: { bozzaId } };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
    summary.closed = true;
    return summary;
  }

  if (/modific/.test(azione)) {
    // Ri-chiama CALLIOPE con istruzioni di modifica
    const step1Start = Date.now();
    try {
      const r = await handleCalliopeBozza(
        { tipo: "preventivo", bozzaIdOriginale: bozzaId, note: payload.istruzioni || "" },
        { userMessage: `orchestrator: modifica preventivo ${bozzaId}` },
      );
      const stepData = {
        step: 1, name: "calliope_modifica", ok: true, ms: Date.now() - step1Start,
        result: { bozzaNuovaId: r?.data?.bozzaId },
      };
      summary.steps.push(stepData);
      await logStep(flowInstanceId, stepData);
    } catch (e) {
      const stepData = { step: 1, name: "calliope_modifica", ok: false, error: String(e).slice(0, 200) };
      summary.steps.push(stepData);
      await logStep(flowInstanceId, stepData);
    }
    summary.pendingApproval = { bozzaId, azione: "modificato" };
    return summary;
  }

  // Approvato → invio ECHO (email)
  const step1Start = Date.now();
  try {
    if (!destinatario) throw new Error("destinatario_mancante");
    // NOTA: handleEchoWhatsApp è per WhatsApp; per email servirebbe un
    // handleEchoSendEmail. In v0.1 logghiamo la richiesta e marchiamo DRY-RUN.
    // Quando ECHO email sarà pronto, qui va sostituita la chiamata.
    await db.collection("nexo_lavagna").add({
      from: "orchestrator", to: "echo", type: "send_email",
      payload: {
        bozzaId, destinatario, cc,
        note: "Invio preventivo approvato da Alberto via NEXUS chat",
      },
      status: "pending", priority: "normal",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const stepData = {
      step: 1, name: "echo_send_email_queued", ok: true, ms: Date.now() - step1Start,
      result: { destinatario, cc, bozzaId },
    };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  } catch (e) {
    const stepData = { step: 1, name: "echo_send_email_queued", ok: false, error: String(e).slice(0, 200), ms: Date.now() - step1Start };
    summary.steps.push(stepData);
    await logStep(flowInstanceId, stepData);
  }

  // Notifica conferma invio
  try {
    await sendPushNotification(
      "Preventivo inviato",
      `Preventivo ${bozzaId} inviato a ${destinatario}.`,
      `/#echo/log`,
      null,
    );
  } catch {}

  summary.closed = true;
  return summary;
}

export async function runOrchestratorWorkflow(msgId, v, msgRef) {
  const type = String(v.type || "").toLowerCase();
  const payload = v.payload || {};

  // Riconoscimento tipo workflow
  const isGuastoUrgente = /guasto_urgente|emergenza|critico|guasto/.test(type);
  const isPreventivo = /preventivo|preparare_preventivo|bozza_preventivo/.test(type);
  const isPreventivoApprovazione = /preventivo_approvazione|preventivo_approva|approva_preventivo/.test(type);

  if (!isGuastoUrgente && !isPreventivo && !isPreventivoApprovazione) {
    logger.info("orchestrator: tipo non gestito, skip", { msgId, type });
    return;
  }

  const workflowType = isGuastoUrgente ? "guasto_urgente" : isPreventivoApprovazione ? "preventivo_approvazione" : "preventivo";
  const flowInstanceId = await createFlow(workflowType, msgId, payload);
  logger.info("orchestrator: flow started", { flowInstanceId, msgId, workflowType });

  let summary;
  try {
    if (isGuastoUrgente) {
      summary = await workflowGuastoUrgente({ flowInstanceId, payload, triggerMsgRef: msgRef });
    } else if (isPreventivoApprovazione) {
      summary = await workflowPreventivoApprovazione({ flowInstanceId, payload });
    } else {
      summary = await workflowPreventivo({ flowInstanceId, payload });
    }
  } catch (e) {
    logger.error("orchestrator: workflow uncaught", { error: String(e), flowInstanceId });
    await finalizeFlow(flowInstanceId, "failed", { error: String(e).slice(0, 300) });
    throw e;
  }

  const allOk = summary.steps.every(s => s.ok);
  const finalStatus = summary.pendingApproval
    ? "in_attesa_approvazione"
    : (allOk ? "completed" : "completed_with_errors");
  await finalizeFlow(flowInstanceId, finalStatus, summary);

  // Marca messaggio lavagna
  try {
    await msgRef.set({
      status: summary.pendingApproval ? "in_progress" : "completed",
      result: {
        flowInstanceId,
        stepsOk: summary.steps.filter(s => s.ok).length,
        stepsTotal: summary.steps.length,
        pendingApproval: summary.pendingApproval || null,
      },
      processedBy: "orchestrator",
      completedAt: summary.pendingApproval ? null : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) { logger.warn("orchestrator: mark done failed", { error: String(e) }); }

  logger.info("orchestrator: flow done", { flowInstanceId, ok: allOk, steps: summary.steps.length, workflowType });
  return summary;
}
