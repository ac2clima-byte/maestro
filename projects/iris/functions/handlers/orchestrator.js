// handlers/orchestrator.js — Workflow multi-step (guasto_urgente).
//
// Ascolta nexo_lavagna dove to=="orchestrator". Esegue workflow:
//   guasto_urgente:
//     1. MEMO.dossier(cliente) → contesto chi è
//     2. ARES.apriIntervento(urgenza=critica) → DRY_RUN
//     3. ECHO.sendWhatsApp(Alberto, "Guasto urgente: ...")
//
// Tutti gli step logati in nexo_orchestrator_log con stato/timestamp.
import { db, FieldValue, logger } from "./shared.js";
import { handleMemoDossier } from "./memo.js";
import { handleAresApriIntervento } from "./ares.js";
import { handleEchoWhatsApp } from "./echo.js";

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

export async function runOrchestratorWorkflow(msgId, v, msgRef) {
  const type = String(v.type || "").toLowerCase();
  const payload = v.payload || {};

  // Riconoscimento tipo workflow
  const isGuastoUrgente = /guasto_urgente|emergenza|critico|guasto/.test(type);
  if (!isGuastoUrgente) {
    logger.info("orchestrator: tipo non gestito, skip", { msgId, type });
    return;
  }

  const flowInstanceId = await createFlow("guasto_urgente", msgId, payload);
  logger.info("orchestrator: flow started", { flowInstanceId, msgId });

  let summary;
  try {
    summary = await workflowGuastoUrgente({ flowInstanceId, payload, triggerMsgRef: msgRef });
  } catch (e) {
    logger.error("orchestrator: workflow uncaught", { error: String(e), flowInstanceId });
    await finalizeFlow(flowInstanceId, "failed", { error: String(e).slice(0, 300) });
    throw e;
  }

  const allOk = summary.steps.every(s => s.ok);
  await finalizeFlow(flowInstanceId, allOk ? "completed" : "completed_with_errors", summary);

  // Marca messaggio lavagna completato
  try {
    await msgRef.set({
      status: "completed",
      result: {
        flowInstanceId,
        stepsOk: summary.steps.filter(s => s.ok).length,
        stepsTotal: summary.steps.length,
      },
      processedBy: "orchestrator",
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) { logger.warn("orchestrator: mark done failed", { error: String(e) }); }

  logger.info("orchestrator: flow done", { flowInstanceId, ok: allOk, steps: summary.steps.length });
  return summary;
}
