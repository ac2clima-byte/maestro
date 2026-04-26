// handlers/email-report.js — endpoint nexoSendReport.
//
// Riceve { to, subject, body, forgeKey? } e manda una email via Gmail SMTP
// (App Password obbligatoria per account Gmail con 2FA). Chiamato da
// maestro.mjs dopo ogni task per spedire un riepilogo a ac2clima@gmail.com.
//
// Sicurezza:
//   - Endpoint pubblico (no Firebase Auth) ma protetto da chiave statica
//     (X-Forge-Key o body.forgeKey). Stessa chiave usata da FORGE.
//   - To allowlist: per default l'unica destinazione consentita è
//     ac2clima@gmail.com (più alberto.contardi@acgclimaservice.com per
//     audit). Override via env REPORT_TO_ALLOWLIST.
//   - Audit: ogni richiesta logga in nexo_email_reports collection.
//   - Graceful degradation: se mancano credenziali GMAIL_USER /
//     GMAIL_APP_PASSWORD scrive solo il log in Firestore e ritorna 200
//     con `sent: false, reason: "credentials_not_configured"`. Non rompe
//     il loop MAESTRO che chiama questo endpoint.

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db, FieldValue, REGION, applyCorsOpen, logger } from "./shared.js";
import { FORGE_KEY } from "./forge.js";
import nodemailer from "nodemailer";

export const GMAIL_USER = defineSecret("GMAIL_USER");
export const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const ALLOWED_TO = new Set([
  "ac2clima@gmail.com",
  "alberto.contardi@acgclimaservice.com",
]);

function getForgeKey() {
  try { return FORGE_KEY.value() || process.env.FORGE_KEY || "nexo-forge-2026"; }
  catch { return process.env.FORGE_KEY || "nexo-forge-2026"; }
}

function getGmailCreds() {
  let user = null, pass = null;
  try { user = GMAIL_USER.value() || null; } catch {}
  try { pass = GMAIL_APP_PASSWORD.value() || null; } catch {}
  if (!user) user = process.env.GMAIL_USER || null;
  if (!pass) pass = process.env.GMAIL_APP_PASSWORD || null;
  if (!user || !pass) return null;
  // Sanity check: i secret placeholder non devono triggerare un tentativo SMTP.
  // Una App Password Gmail è ESATTAMENTE 16 caratteri (eventuali spazi rimossi).
  // Se vedi una password più corta o l'user che non sembra un email, considera
  // le credenziali non configurate (graceful skip).
  const passClean = pass.replace(/\s+/g, "");
  if (!user.includes("@") || passClean.length < 16) return null;
  return { user, pass: passClean };
}

export const nexoSendReport = onRequest(
  {
    region: REGION,
    cors: true,
    secrets: [FORGE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD],
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (req, res) => {
    applyCorsOpen(req, res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

    // Auth: chiave statica (X-Forge-Key o body.forgeKey).
    const expected = getForgeKey();
    const provided = String(req.headers["x-forge-key"] || (req.body && req.body.forgeKey) || "");
    if (!provided || provided !== expected) {
      res.status(403).json({ error: "invalid_forge_key" });
      return;
    }

    const body = req.body || {};
    const to = String(body.to || "").trim().toLowerCase();
    const subject = String(body.subject || "").trim();
    const bodyText = String(body.body || body.text || "").trim();

    if (!to || !subject || !bodyText) {
      res.status(400).json({ error: "missing_to_subject_or_body" });
      return;
    }
    if (!ALLOWED_TO.has(to)) {
      res.status(403).json({ error: "to_not_allowed", allowed: [...ALLOWED_TO] });
      return;
    }
    if (subject.length > 250) { res.status(400).json({ error: "subject_too_long" }); return; }
    if (bodyText.length > 50_000) { res.status(400).json({ error: "body_too_long" }); return; }

    const startedAt = Date.now();
    const logRef = db.collection("nexo_email_reports").doc();

    // Log richiesta SUBITO (audit anche in caso di failure SMTP).
    try {
      await logRef.set({
        id: logRef.id,
        to, subject, body: bodyText.slice(0, 5000),
        createdAt: FieldValue.serverTimestamp(),
        status: "pending",
      });
    } catch (e) {
      logger.warn("nexoSendReport audit log failed", { error: String(e).slice(0, 150) });
    }

    const creds = getGmailCreds();
    if (!creds) {
      // Graceful degradation: niente credenziali → log + 200 con sent=false.
      try {
        await logRef.set({ status: "skipped", reason: "credentials_not_configured", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch {}
      res.status(200).json({
        ok: true, sent: false,
        reason: "credentials_not_configured",
        hint: "firebase functions:secrets:set GMAIL_USER ; firebase functions:secrets:set GMAIL_APP_PASSWORD",
        logId: logRef.id,
        tookMs: Date.now() - startedAt,
      });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: creds.user, pass: creds.pass },
      });
      const info = await transporter.sendMail({
        from: `"NEXO FORGE" <${creds.user}>`,
        to,
        subject,
        text: bodyText,
      });
      await logRef.set({
        status: "sent",
        messageId: info.messageId || null,
        from: creds.user,
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(200).json({
        ok: true, sent: true,
        messageId: info.messageId || null,
        logId: logRef.id,
        tookMs: Date.now() - startedAt,
      });
    } catch (e) {
      logger.error("nexoSendReport SMTP failed", { error: String(e).slice(0, 300) });
      try {
        await logRef.set({
          status: "failed",
          error: String(e).slice(0, 500),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch {}
      res.status(500).json({ ok: false, error: String(e).slice(0, 300), logId: logRef.id });
    }
  }
);
