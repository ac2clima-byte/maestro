// nexoForgeTask.js — Cloud Function bridge Claude Chat → GitHub.
//
// Permette a Claude Chat (sandbox web/app, senza credenziali persistenti)
// di scrivere task in tasks/ del repo ac2clima-byte/maestro via API GitHub.
// Auth verso GitHub: GitHub App con JWT → installation token short-lived.
//
// Sicurezza a strati:
//  - Bearer token (NEXO_FORGE_TOKEN) — chi può chiamare
//  - HMAC SHA-256 (NEXO_FORGE_SIGNING_KEY) — integrità + identità del payload
//  - Actor whitelist (solo "claude-chat" per ora)
//  - Timestamp window ±5min — anti-replay temporale
//  - Nonce UUID — anti-replay per chiamate duplicate
//  - Filename regex chiusa + prefissi dev-* vietati
//  - Rate limit 30/h per actor
//  - Log strutturato in nexo_forge_log
//
// Modulo ESM (codebase "type":"module").

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

if (getApps().length === 0) initializeApp();

// Secrets gestiti da Secret Manager
const FORGE_TOKEN = defineSecret("NEXO_FORGE_TOKEN");
const SIGNING_KEY = defineSecret("NEXO_FORGE_SIGNING_KEY");
const GH_APP_ID = defineSecret("NEXO_FORGE_GH_APP_ID");
const GH_INSTALLATION_ID = defineSecret("NEXO_FORGE_GH_INSTALLATION_ID");
const GH_PRIVATE_KEY = defineSecret("NEXO_FORGE_GH_PRIVATE_KEY");

const REPO_OWNER = "ac2clima-byte";
const REPO_NAME = "maestro";
const ALLOWED_ACTORS = new Set(["claude-chat"]);
const FILENAME_RE = /^[a-z0-9][a-z0-9\-_]{2,80}\.md$/;
const FORBIDDEN_PREFIXES = ["dev-request-", "dev-analysis-", "dev-approved-"];
const MAX_CONTENT_BYTES = 50 * 1024;
const TIMESTAMP_TOLERANCE_SEC = 300;
const NONCE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 30;

// Cache installation token in memoria (TTL 50 min, GitHub li dà 1h)
let cachedInstallationToken = null;
let cachedInstallationTokenExp = 0;

export const nexoForgeTask = onRequest(
  {
    region: "europe-west1",
    secrets: [FORGE_TOKEN, SIGNING_KEY, GH_APP_ID, GH_INSTALLATION_ID, GH_PRIVATE_KEY],
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (req, res) => {
    const startMs = Date.now();
    const db = getFirestore();
    const logEntry = {
      ts: FieldValue.serverTimestamp(),
      method: req.method,
      ip: req.ip,
      ok: false,
    };

    try {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
      }

      // 1. Bearer token
      const authHeader = req.get("authorization") || "";
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!bearerMatch) {
        logEntry.error = "missing_bearer";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }
      const presentedToken = bearerMatch[1].trim();
      if (!constantTimeEqual(presentedToken, FORGE_TOKEN.value())) {
        logEntry.error = "bad_bearer";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }

      // 2. Body shape
      const body = req.body || {};
      const { filename, content, commit_message, actor, nonce, timestamp } = body;
      if (!filename || !content || !commit_message || !actor || !nonce || !timestamp) {
        logEntry.error = "bad_payload";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }
      logEntry.actor = actor;
      logEntry.filename = filename;
      logEntry.nonce = nonce;

      // 3. HMAC signature on canonical payload
      const sigHeader = req.get("x-forge-signature") || "";
      const sigMatch = /^sha256=([a-f0-9]{64})$/i.exec(sigHeader);
      if (!sigMatch) {
        logEntry.error = "missing_sig";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "bad_signature" });
      }
      const presentedSig = sigMatch[1].toLowerCase();
      const canonical = JSON.stringify({
        filename, content, commit_message, actor, nonce, timestamp,
      });
      const expectedSig = crypto
        .createHmac("sha256", SIGNING_KEY.value())
        .update(canonical)
        .digest("hex");
      if (!constantTimeEqual(presentedSig, expectedSig)) {
        logEntry.error = "bad_sig";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "bad_signature" });
      }

      // 4. Actor whitelist
      if (!ALLOWED_ACTORS.has(actor)) {
        logEntry.error = "actor_not_allowed";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(403).json({ ok: false, error: "actor_not_allowed" });
      }

      // 5. Timestamp window
      const tsNum = Number(timestamp);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > TIMESTAMP_TOLERANCE_SEC) {
        logEntry.error = "timestamp_skew";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(400).json({ ok: false, error: "timestamp_skew" });
      }

      // 6. Filename validation
      if (!FILENAME_RE.test(filename)) {
        logEntry.error = "bad_filename";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(400).json({ ok: false, error: "bad_filename" });
      }
      for (const p of FORBIDDEN_PREFIXES) {
        if (filename.startsWith(p)) {
          logEntry.error = "forbidden_prefix";
          await db.collection("nexo_forge_log").add(logEntry);
          return res.status(400).json({ ok: false, error: "forbidden_prefix" });
        }
      }

      // 7. Content size
      const contentBytes = Buffer.byteLength(content, "utf8");
      if (contentBytes > MAX_CONTENT_BYTES) {
        logEntry.error = "content_too_large";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(413).json({ ok: false, error: "content_too_large" });
      }

      // 8. Nonce replay check
      const nonceRef = db.collection("nexo_forge_nonces").doc(nonce);
      const nonceSnap = await nonceRef.get();
      if (nonceSnap.exists) {
        logEntry.error = "nonce_replay";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(409).json({ ok: false, error: "nonce_replay" });
      }
      await nonceRef.set({
        actor,
        filename,
        usedAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + NONCE_TTL_MS),
      });

      // 9. Rate limit per actor (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const rlSnap = await db
        .collection("nexo_forge_log")
        .where("actor", "==", actor)
        .where("ok", "==", true)
        .where("ts", ">=", oneHourAgo)
        .count()
        .get();
      if (rlSnap.data().count >= RATE_LIMIT_PER_HOUR) {
        logEntry.error = "rate_limit";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(429).json({ ok: false, error: "rate_limit" });
      }

      // 10. Get installation token (cached) e committa via API GitHub
      const ghToken = await getInstallationToken();
      const path = `tasks/${filename}`;
      const ghBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;

      // 10a. Check non-overwrite
      const checkResp = await fetch(ghBase, { headers: ghHeaders(ghToken) });
      if (checkResp.status === 200) {
        logEntry.error = "file_exists";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(409).json({ ok: false, error: "file_exists", path });
      }
      if (checkResp.status !== 404) {
        const txt = await checkResp.text();
        logEntry.error = `github_check_${checkResp.status}`;
        logEntry.detail = txt.slice(0, 300);
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(502).json({ ok: false, error: "github_unreachable" });
      }

      // 10b. Create file
      const putResp = await fetch(ghBase, {
        method: "PUT",
        headers: { ...ghHeaders(ghToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commit_message,
          content: Buffer.from(content, "utf8").toString("base64"),
          branch: "main",
        }),
      });
      if (!putResp.ok) {
        const txt = await putResp.text();
        logEntry.error = `github_put_${putResp.status}`;
        logEntry.detail = txt.slice(0, 300);
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(502).json({
          ok: false,
          error: "github_write_failed",
          status: putResp.status,
          detail: txt.slice(0, 300),
        });
      }

      const ghData = await putResp.json();
      const sha = ghData.commit?.sha;
      const url = ghData.commit?.html_url;

      // 11. Success log
      logEntry.ok = true;
      logEntry.commitSha = sha;
      logEntry.filesize = contentBytes;
      logEntry.durationMs = Date.now() - startMs;
      delete logEntry.error;
      await db.collection("nexo_forge_log").add(logEntry);

      return res.status(200).json({
        ok: true,
        filename,
        path,
        commit_sha: sha,
        commit_url: url,
        filesize: contentBytes,
        duration_ms: logEntry.durationMs,
      });
    } catch (err) {
      logEntry.error = "exception";
      logEntry.detail = String(err?.message || err).slice(0, 500);
      try { await db.collection("nexo_forge_log").add(logEntry); } catch {}
      return res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

// ─── GitHub App auth helpers ────────────────────────────────────

async function getInstallationToken() {
  if (cachedInstallationToken && Date.now() < cachedInstallationTokenExp - 60_000) {
    return cachedInstallationToken;
  }
  const appJwt = generateAppJwt();
  const installationId = GH_INSTALLATION_ID.value();
  const resp = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${appJwt}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nexoForgeTask/1.0",
      },
    }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`installation_token_failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  cachedInstallationToken = data.token;
  cachedInstallationTokenExp = new Date(data.expires_at).getTime();
  return cachedInstallationToken;
}

function generateAppJwt() {
  const appId = GH_APP_ID.value();
  const privateKey = GH_PRIVATE_KEY.value();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 30,
    exp: now + 9 * 60,
    iss: appId,
  };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${signingInput}.${b64urlBuf(signature)}`;
}

function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlBuf(buf) {
  return buf.toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function ghHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nexoForgeTask/1.0",
  };
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
