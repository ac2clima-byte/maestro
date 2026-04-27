// handlers/forge.js — endpoint test interno per il sistema FORGE.
//
// FORGE è il sistema con cui Claude Code può testare NEXUS scrivendo
// messaggi e leggendo le risposte, senza dover passare da Firebase Auth
// (Claude Code non ha credenziali utente).
//
// Sicurezza: protetto da una chiave fissa X-Forge-Key (o body.forgeKey).
// Default `nexo-forge-2026`, override via secret/env FORGE_KEY.
//
// Le richieste/risposte vengono scritte in nexus_chat con sessionId
// "forge-test" + il timestamp del giorno (così la PWA mostra una sessione
// FORGE separata da quelle utente reali).
//
// Riusa la stessa pipeline di nexusRouter:
//   loadConversationContext → callHaikuForIntent → parseAndValidateIntent
//   → tryDirectAnswer → writeNexusMessage.
// Niente lavagna async (FORGE è sincrono), niente intercept di
// preventivo/email queue/dev request (non servono al test smoke).

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { ANTHROPIC_API_KEY, REGION, MODEL, applyCorsOpen, logger, naturalize } from "./shared.js";
import {
  loadConversationContext, callHaikuForIntent, parseAndValidateIntent,
  tryDirectAnswer, writeNexusMessage, ensureNexusSession,
} from "./nexus.js";
import { runPreventivoWorkflow, tryInterceptPreventivoVoci, tryInterceptPreventivoIva, tryInterceptPreventivoHaikuFallback, tryInterceptPreventivoSi, tryInterceptPreventivoModifica } from "./preventivo.js";
import { tryInterceptAresConfermaIntervento, handleAresCreaIntervento, isCreaInterventoCommand } from "./ares.js";

// Secret opzionale — se non definito, fallback a "nexo-forge-2026" via env.
export const FORGE_KEY = defineSecret("FORGE_KEY");

const FORGE_SESSION_PREFIX = "forge-test";

// Heuristica "linguaggio naturale": niente bold, niente bullet, niente
// emoji decorative tipiche del formato robotico. Semplice e veloce — la
// vera safety net è naturalize() in shared.js, già applicata in
// writeNexusMessage.
const ROBOTIC_MARKERS = /(\*\*|^\s*[·•-]\s|📧|📊|🚨|⚠️|✅)/m;
function isNatural(text) {
  if (!text) return true;
  return !ROBOTIC_MARKERS.test(text);
}

function getExpectedKey() {
  // Priority: param Secret > env > default.
  try { return FORGE_KEY.value() || process.env.FORGE_KEY || "nexo-forge-2026"; }
  catch { return process.env.FORGE_KEY || "nexo-forge-2026"; }
}

export const nexusTestInternal = onRequest(
  {
    region: REGION,
    cors: true,
    secrets: [ANTHROPIC_API_KEY, FORGE_KEY],
    timeoutSeconds: 60,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    // Auth FORGE: header X-Forge-Key oppure body.forgeKey
    const expected = getExpectedKey();
    const provided = String(
      req.headers["x-forge-key"] || (req.body && req.body.forgeKey) || ""
    );
    if (!provided || provided !== expected) {
      res.status(403).json({ error: "invalid_forge_key" });
      return;
    }

    const body = req.body || {};
    const message = String(body.message || "").trim();
    if (!message) { res.status(400).json({ error: "missing_message" }); return; }
    if (message.length > 2000) { res.status(400).json({ error: "message_too_long" }); return; }

    // SessionId: per default "forge-test" globale, ma un client può
    // suggerire un suffisso (es. "forge-test-quante-email") per separare
    // gli scambi di test diversi nella PWA.
    const requestedSession = String(body.sessionId || "").trim();
    const sessionId = requestedSession.startsWith(FORGE_SESSION_PREFIX)
      ? requestedSession.slice(0, 80)
      : FORGE_SESSION_PREFIX;

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) { res.status(500).json({ error: "missing_anthropic_key" }); return; }

    const userId = "forge@nexo.internal";
    const startedAt = Date.now();

    try {
      await ensureNexusSession(sessionId, userId, message);
      const userMsgId = await writeNexusMessage(sessionId, { role: "user", content: message });

      // Intercept preventivo IVA: regime fiscale (reverse charge, split,
      // esente, "iva N%") modifica IVA+totale del pending.
      try {
        const prevIva = await tryInterceptPreventivoIva({ userMessage: message, sessionId, userId });
        if (prevIva && prevIva._preventivoIvaHandled) {
          const cleaned = naturalize(prevIva.content || "");
          const nexusMessageId = await writeNexusMessage(sessionId, {
            role: "assistant", content: cleaned,
            direct: { data: prevIva.data || null, failed: false },
            stato: "completata", modello: "preventivo_iva",
          });
          res.status(200).json({
            query: message, reply: cleaned,
            collega: "orchestrator", azione: "preventivo_iva",
            stato: "completata", natural: isNatural(cleaned),
            direct: { ok: true, data: prevIva.data || null },
            sessionId, userMsgId, nexusMessageId,
            modello: "preventivo_iva",
            tookMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (e) {
        logger.warn("forge: preventivo iva intercept failed", { error: String(e).slice(0, 150) });
      }

      // Intercept preventivo voci: se la sessione ha un pending in attesa_voci
      // parsa il messaggio (es. "sopralluogo 200, relazione tecnica 150").
      try {
        const prevVoci = await tryInterceptPreventivoVoci({ userMessage: message, sessionId, userId });
        if (prevVoci && (prevVoci._preventivoVociHandled || prevVoci._preventivoVociFailed)) {
          const cleaned = naturalize(prevVoci.content || "");
          const nexusMessageId = await writeNexusMessage(sessionId, {
            role: "assistant", content: cleaned,
            direct: { data: prevVoci.data || null, failed: !!prevVoci._preventivoVociFailed },
            stato: prevVoci._preventivoVociHandled ? "completata" : "errore_handler",
            modello: "preventivo_voci",
          });
          res.status(200).json({
            query: message, reply: cleaned,
            collega: "orchestrator", azione: "preventivo_voci",
            stato: prevVoci._preventivoVociHandled ? "completata" : "errore_handler",
            natural: isNatural(cleaned),
            direct: { ok: !!prevVoci._preventivoVociHandled, data: prevVoci.data || null },
            sessionId, userMsgId, nexusMessageId,
            modello: "preventivo_voci",
            tookMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (e) {
        logger.warn("forge: preventivo voci intercept failed", { error: String(e).slice(0, 150) });
      }

      // Intercept "modifica": riporta il pending da attesa_approvazione
      // ad attesa_voci e mostra le voci attuali.
      try {
        const prevMod = await tryInterceptPreventivoModifica({ userMessage: message, sessionId, userId });
        if (prevMod && prevMod._preventivoModificaHandled) {
          const cleaned = naturalize(prevMod.content || "");
          const nexusMessageId = await writeNexusMessage(sessionId, {
            role: "assistant", content: cleaned,
            direct: { data: prevMod.data || null, failed: false },
            stato: "completata", modello: "preventivo_modifica",
          });
          res.status(200).json({
            query: message, reply: cleaned,
            collega: "orchestrator", azione: "preventivo_modifica",
            stato: "completata", natural: isNatural(cleaned),
            direct: { ok: true, data: prevMod.data || null },
            sessionId, userMsgId, nexusMessageId,
            modello: "preventivo_modifica",
            tookMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (e) {
        logger.warn("forge: preventivo modifica intercept failed", { error: String(e).slice(0, 150) });
      }

      // Intercept "sì" rapido: approva e genera PDF tramite GRAPH.
      try {
        const prevSi = await tryInterceptPreventivoSi({ userMessage: message, sessionId, userId });
        if (prevSi && prevSi._preventivoHaikuHandled) {
          const cleaned = naturalize(prevSi.content || "");
          const nexusMessageId = await writeNexusMessage(sessionId, {
            role: "assistant", content: cleaned,
            direct: { data: prevSi.data || null, failed: false },
            stato: "completata", modello: "preventivo_approva_pdf",
          });
          res.status(200).json({
            query: message, reply: cleaned,
            collega: "orchestrator", azione: "preventivo_approva_pdf",
            stato: "completata", natural: isNatural(cleaned),
            direct: { ok: true, data: prevSi.data || null },
            sessionId, userMsgId, nexusMessageId,
            modello: "preventivo_approva_pdf",
            tookMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (e) {
        logger.warn("forge: preventivo si intercept failed", { error: String(e).slice(0, 150) });
      }

      // Intercept Haiku fallback: se i parser regex non hanno matchato ma c'è
      // un pending per la sessione, chiediamo a Haiku di interpretare il
      // messaggio (aggiungi/rimuovi voce, sconto, modifica IVA, chiarimento).
      try {
        const prevHaiku = await tryInterceptPreventivoHaikuFallback({ userMessage: message, sessionId, userId });
        if (prevHaiku && prevHaiku._preventivoHaikuHandled) {
          const cleaned = naturalize(prevHaiku.content || "");
          const nexusMessageId = await writeNexusMessage(sessionId, {
            role: "assistant", content: cleaned,
            direct: { data: prevHaiku.data || null, failed: false },
            stato: "completata", modello: "preventivo_haiku_fallback",
          });
          res.status(200).json({
            query: message, reply: cleaned,
            collega: "orchestrator", azione: "preventivo_haiku_fallback",
            stato: "completata", natural: isNatural(cleaned),
            direct: { ok: true, data: prevHaiku.data || null },
            sessionId, userMsgId, nexusMessageId,
            modello: "preventivo_haiku_fallback",
            tookMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (e) {
        logger.warn("forge: preventivo haiku fallback failed", { error: String(e).slice(0, 150) });
      }

      // ARES conferma intervento: scrive su bacheca_cards (DRY_RUN automatico
      // per le sessioni forge-test, vedi _isForgeSession in ares.js).
      try {
        const aresOk = await tryInterceptAresConfermaIntervento({ userMessage: message, sessionId, userId });
        if (aresOk && aresOk._aresConfermaHandled) {
          const cleaned = naturalize(aresOk.content || "");
          const nexusMessageId = await writeNexusMessage(sessionId, {
            role: "assistant", content: cleaned,
            direct: { data: aresOk.data || null, failed: !!aresOk._failed },
            stato: aresOk._failed ? "errore_handler" : "completata",
            modello: "ares_conferma",
          });
          res.status(200).json({
            query: message, reply: cleaned,
            collega: "ares", azione: "conferma_intervento",
            stato: aresOk._failed ? "errore_handler" : "completata",
            natural: isNatural(cleaned),
            direct: { ok: !aresOk._failed, data: aresOk.data || null },
            sessionId, userMsgId, nexusMessageId,
            modello: "ares_conferma",
            tookMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
          return;
        }
      } catch (e) {
        logger.warn("forge: ares conferma intercept failed", { error: String(e).slice(0, 150) });
      }

      // Intercept ARES crea_intervento: se il messaggio è un comando di
      // creazione esplicito ("metti/crea/programma intervento ..."),
      // chiama direttamente handleAresCreaIntervento bypassando Haiku.
      // Utile sia per FORGE (test deterministici) sia per fallback quando
      // Anthropic API è giù.
      try {
        if (isCreaInterventoCommand(message)) {
          const ar = await handleAresCreaIntervento({}, { userMessage: message, sessionId });
          if (ar && ar.content) {
            const cleaned = naturalize(ar.content);
            const nexusMessageId = await writeNexusMessage(sessionId, {
              role: "assistant", content: cleaned,
              direct: { data: ar.data || null, failed: false },
              stato: "completata", modello: "ares_crea_intervento",
            });
            res.status(200).json({
              query: message, reply: cleaned,
              collega: "ares", azione: "crea_intervento",
              stato: "completata", natural: isNatural(cleaned),
              direct: { ok: true, data: ar.data || null },
              sessionId, userMsgId, nexusMessageId,
              modello: "ares_crea_intervento",
              tookMs: Date.now() - startedAt,
              timestamp: new Date().toISOString(),
            });
            return;
          }
        }
      } catch (e) {
        logger.warn("forge: ares crea intercept failed", { error: String(e).slice(0, 150) });
      }

      // Intercept preventivo workflow per aderenza al routing reale di nexusRouter.
      // FORGE deve testare anche questo path; il workflow stesso è dry-run safe
      // se sessionId inizia con "forge-test" (DRY_RUN ECHO + nessun side effect).
      if (/^\s*(prepara|genera|fai|scriv\w+)\s+(il\s+|un\s+)?preventiv/i.test(message)) {
        try {
          const prev = await runPreventivoWorkflow({ userMessage: message, context: {}, userId, sessionId });
          if (prev) {
            const cleaned = naturalize(prev.content || "");
            const nexusMessageId = await writeNexusMessage(sessionId, {
              role: "assistant", content: cleaned,
              direct: { data: prev.data || null, failed: false },
              stato: "completata", modello: "preventivo_workflow",
            });
            res.status(200).json({
              query: message, reply: cleaned,
              collega: "orchestrator", azione: "preparare_preventivo",
              stato: "completata", natural: isNatural(cleaned),
              direct: { ok: true, data: prev.data || null },
              sessionId, userMsgId, nexusMessageId,
              modello: "preventivo_workflow",
              tookMs: Date.now() - startedAt,
              timestamp: new Date().toISOString(),
            });
            return;
          }
        } catch (e) {
          logger.warn("forge: preventivo workflow failed, fallback Haiku", { error: String(e).slice(0, 150) });
        }
      }

      // Pipeline: loadContext → haiku intent → parse → tryDirectAnswer
      const sessionContext = await loadConversationContext(sessionId, 5);
      const messages = [...sessionContext, { role: "user", content: message }];

      let haiku;
      try {
        haiku = await callHaikuForIntent(apiKey, messages);
      } catch (e) {
        const fallback = {
          collega: "nessuno", azione: "errore", parametri: {},
          confidenza: 0,
          rispostaUtente: `Errore interpretazione: ${String(e).slice(0, 120)}`,
        };
        const cleaned = naturalize(fallback.rispostaUtente);
        const nexusMessageId = await writeNexusMessage(sessionId, {
          role: "assistant", content: cleaned, intent: fallback,
          stato: "errore_modello", modello: MODEL,
        });
        res.status(200).json({
          query: message, reply: cleaned, collega: "nessuno", azione: "errore",
          stato: "errore_modello", natural: isNatural(cleaned),
          sessionId, userMsgId, nexusMessageId,
          tookMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const intent = parseAndValidateIntent(haiku.text, message);
      const direct = await tryDirectAnswer(intent, message, sessionId);

      let finalContent = intent.rispostaUtente;
      let stato = "assegnata";
      if (direct && !direct._failed) {
        finalContent = direct.content || finalContent;
        stato = "completata";
      } else if (direct && direct._failed) {
        finalContent = direct.content || finalContent;
        stato = "errore_handler";
      }
      // FORGE è sincrono: niente lavagna async. Se l'intent richiederebbe
      // un Collega async (ECHO whatsapp, ARES apri intervento), lo stato
      // resta "assegnata" e il test deve solo verificare che intent +
      // rispostaUtente siano sensate.

      const cleaned = naturalize(finalContent || "");
      const nexusMessageId = await writeNexusMessage(sessionId, {
        role: "assistant", content: cleaned, intent, stato,
        direct: direct ? { data: direct.data || null, failed: !!direct._failed } : null,
        modello: MODEL, usage: haiku.usage,
      });

      // Se Haiku ha messo "nessuno" ma un direct handler regex-based ha matchato,
      // il Collega effettivo è quello del handler (più informativo per testing).
      const effectiveCollega = (direct && direct._handlerCollega)
        ? direct._handlerCollega
        : intent.collega;

      res.status(200).json({
        query: message,
        reply: cleaned,
        collega: effectiveCollega,
        haikuCollega: intent.collega,
        azione: intent.azione,
        confidenza: intent.confidenza,
        stato,
        natural: isNatural(cleaned),
        direct: direct ? { ok: !direct._failed, data: direct.data || null } : null,
        sessionId, userMsgId, nexusMessageId,
        modello: MODEL,
        usage: haiku.usage,
        tookMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      logger.error("nexusTestInternal failed", { error: String(e) });
      res.status(500).json({ error: "internal_error", detail: String(e).slice(0, 300) });
    }
  }
);
