// handlers/tts.js — TTS via Microsoft Edge Read Aloud (voce Diego).
//
// Usa msedge-tts (npm) per chiamare l'endpoint Microsoft Speech gratuito
// (stesso usato dal browser Edge). Nessuna API key richiesta.
//
// Cache per testi ricorrenti: md5(testo) → Firestore doc binario base64
// (max 100KB per MP3 — sufficiente per ~20s di audio).
//
// Endpoint:
//   POST /nexusTts
//   Body: { text: "...", voice?: "it-IT-DiegoNeural", rate?: "+10%" }
//   Return: Content-Type: audio/mpeg, body: MP3 binary
//
// Cache: se text già generato di recente → restituisce da Firestore.
// TTL cache: 30 giorni (evitare accumulo infinito).

import crypto from "crypto";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { db, FieldValue, logger } from "./shared.js";

const DEFAULT_VOICE = "it-IT-DiegoNeural";
const DEFAULT_RATE = "+10%";
const MAX_TEXT_LEN = 3000;
const CACHE_COLLECTION = "nexus_tts_cache";
const CACHE_MAX_SIZE = 300_000; // 300KB per entry (skip cache se audio più grande)

function cacheKey(text, voice, rate) {
  const normalized = String(text || "").trim().toLowerCase();
  return crypto.createHash("md5").update(`${voice}|${rate}|${normalized}`).digest("hex");
}

async function getCached(key) {
  try {
    const snap = await db.collection(CACHE_COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const v = snap.data() || {};
    if (!v.audioBase64) return null;
    // Bump lastUsed per LRU soft
    db.collection(CACHE_COLLECTION).doc(key).set({
      lastUsedAt: FieldValue.serverTimestamp(),
      hits: FieldValue.increment(1),
    }, { merge: true }).catch(() => {});
    return Buffer.from(v.audioBase64, "base64");
  } catch (e) {
    logger.warn("tts cache read failed", { error: String(e).slice(0, 150) });
    return null;
  }
}

async function putCached(key, text, voice, rate, audioBuf) {
  if (audioBuf.length > CACHE_MAX_SIZE) return; // skip, troppo grande
  try {
    await db.collection(CACHE_COLLECTION).doc(key).set({
      text: text.slice(0, 500),
      voice,
      rate,
      audioBase64: audioBuf.toString("base64"),
      size: audioBuf.length,
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: FieldValue.serverTimestamp(),
      hits: 1,
    });
  } catch (e) {
    logger.warn("tts cache write failed", { error: String(e).slice(0, 150) });
  }
}

/**
 * Genera audio MP3 dal testo tramite Microsoft Edge Read Aloud.
 * Restituisce un Buffer di bytes MP3.
 */
export async function generateTts(text, voice = DEFAULT_VOICE, rate = DEFAULT_RATE) {
  const clean = String(text || "").slice(0, MAX_TEXT_LEN);
  if (!clean.trim()) throw new Error("empty_text");

  const key = cacheKey(clean, voice, rate);
  const cached = await getCached(key);
  if (cached) return { audio: cached, cached: true, cacheKey: key };

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // toStream → Readable. Collect into Buffer.
  const { audioStream } = tts.toStream(clean, { rate });
  const chunks = [];
  await new Promise((resolve, reject) => {
    audioStream.on("data", (c) => chunks.push(c));
    audioStream.on("end", resolve);
    audioStream.on("close", resolve);
    audioStream.on("error", reject);
  });
  const audio = Buffer.concat(chunks);
  if (!audio.length) throw new Error("empty_audio_output");

  // Salva in cache in background
  putCached(key, clean, voice, rate, audio).catch(() => {});

  return { audio, cached: false, cacheKey: key };
}

/**
 * Pulisce cache entries più vecchie di TTL_DAYS (chiamato da scheduler).
 */
export async function cleanupTtsCache({ ttlDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - ttlDays * 86400 * 1000);
  try {
    const snap = await db.collection(CACHE_COLLECTION)
      .where("lastUsedAt", "<", cutoff)
      .limit(500)
      .get();
    let deleted = 0;
    for (const doc of snap.docs) {
      await doc.ref.delete().catch(() => {});
      deleted++;
    }
    return { deleted };
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
}
