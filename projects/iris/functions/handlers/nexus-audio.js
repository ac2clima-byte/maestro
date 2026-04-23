// handlers/nexus-audio.js — upload audio chiamate + trascrizione + analisi
//
// Flow:
//  1. Client manda POST multipart con file audio (max ~20MB raw; Whisper limit
//     OpenAI è 25MB).
//  2. Se OPENAI_API_KEY è configurata → chiama Whisper API
//     (api.openai.com/v1/audio/transcriptions) → ritorna trascrizione.
//  3. Chiama Haiku con prompt "analizza questa trascrizione chiamata" →
//     estrae persone coinvolte, argomento, intent, azioni suggerite.
//  4. Salva trascrizione + analisi in Firestore (nexus_audio_transcripts)
//     per audit + riuso.
//  5. Ritorna al client { text, analysis, transcriptId } — il client le
//     mostra nella chat NEXUS come risposta assistant.
//
// Se OPENAI_API_KEY manca → ritorna 503 con messaggio esplicativo.

import {
  db, FieldValue, logger,
  ANTHROPIC_API_KEY, ANTHROPIC_URL, MODEL,
} from "./shared.js";

// Whisper API key: letta da env variable OPENAI_API_KEY (se configurata).
// Per abilitare il servizio, imposta il secret con:
//   firebase functions:secrets:set OPENAI_API_KEY
// e riattiva `secrets: [OPENAI_API_KEY_SECRET]` nel nexusTranscribeAudio.
// Finché non è configurata, l'endpoint ritorna 503 con messaggio esplicativo.

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

const AUDIO_ANALYSIS_SYSTEM = `Sei l'assistente di Alberto Contardi (ACG Clima Service, manutenzione HVAC, Piemonte).
Hai ricevuto la TRASCRIZIONE di una chiamata telefonica. Analizzala e rispondi SOLO con JSON:

{
  "persone": [{"nome":"","ruolo":"","contatto":""}],
  "argomento": "<1 frase>",
  "intent": "preparare_preventivo|aprire_intervento_urgente|aprire_intervento_ordinario|rispondere_a_richiesta|registrare_incasso|sollecitare_pagamento|nessuna_azione",
  "urgenza": "bassa|media|alta|critica",
  "sentiment": "positivo|neutro|frustrato|arrabbiato|disperato",
  "azioni_suggerite": ["<azione 1>", "<azione 2>"],
  "riepilogo": "<2-3 frasi>",
  "prossimo_passo": "<1-2 frasi operative>"
}

REGOLE:
- Ometti campi che non riesci a estrarre con certezza.
- Niente code fence, niente testo extra.
- Italiano operativo, concreto, da collega che prende appunti.`;

async function callWhisper(openaiKey, audioBuffer, fileName, mimeType) {
  const form = new FormData();
  // Node 20 FormData + Blob
  const blob = new Blob([audioBuffer], { type: mimeType || "audio/mpeg" });
  form.append("file", blob, fileName || "audio.mp3");
  form.append("model", "whisper-1");
  form.append("language", "it");
  form.append("response_format", "json");

  const resp = await fetch(WHISPER_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Whisper ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json = await resp.json();
  return String(json.text || "").trim();
}

async function analyzeTranscript(anthropicKey, transcript) {
  const payload = {
    model: MODEL,
    max_tokens: 1000,
    system: AUDIO_ANALYSIS_SYSTEM,
    messages: [{ role: "user", content: `Trascrizione chiamata:\n\n${transcript.slice(0, 8000)}` }],
  };
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Haiku ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return { _raw: text };
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return { _raw: text }; }
}

function formatAnalysis(transcript, analysis, transcriptId) {
  const lines = [];
  lines.push(`📞 **Chiamata trascritta** (id: \`${transcriptId}\`)`);
  lines.push("");
  if (analysis.riepilogo) {
    lines.push(`**Riepilogo**: ${analysis.riepilogo}`);
    lines.push("");
  }
  if (Array.isArray(analysis.persone) && analysis.persone.length) {
    lines.push(`**Persone**: ${analysis.persone.map(p => p.nome + (p.ruolo ? ` (${p.ruolo})` : "")).filter(Boolean).join(", ")}`);
  }
  if (analysis.argomento) lines.push(`**Argomento**: ${analysis.argomento}`);
  if (analysis.intent) lines.push(`**Intent**: \`${analysis.intent}\``);
  if (analysis.urgenza) lines.push(`**Urgenza**: ${analysis.urgenza}`);
  if (analysis.sentiment) lines.push(`**Sentiment**: ${analysis.sentiment}`);
  lines.push("");
  if (analysis.prossimo_passo) {
    lines.push(`**Prossimo passo**: ${analysis.prossimo_passo}`);
    lines.push("");
  }
  if (Array.isArray(analysis.azioni_suggerite) && analysis.azioni_suggerite.length) {
    lines.push(`**Azioni suggerite**:`);
    for (const a of analysis.azioni_suggerite) lines.push(`• ${a}`);
    lines.push("");
  }
  lines.push(`_Trascrizione (${transcript.length} char)_: ${transcript.slice(0, 500)}${transcript.length > 500 ? "…" : ""}`);
  return lines.join("\n");
}

/**
 * handleNexusTranscribeAudio
 * @param {object} params - { audioBuffer, fileName, mimeType, userId, sessionId }
 * @returns {object} - { ok, text, analysis, transcriptId, formatted }
 */
export async function handleNexusTranscribeAudio({ audioBuffer, fileName, mimeType, userId, sessionId }) {
  if (!audioBuffer || !audioBuffer.length) {
    return { ok: false, error: "empty_audio" };
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return { ok: false, error: "audio_too_large", maxBytes: MAX_AUDIO_BYTES };
  }

  // Check OPENAI_API_KEY (letto da env — disponibile se il secret è
  // registrato e incluso nell'array secrets della function)
  const openaiKey = process.env.OPENAI_API_KEY || null;
  if (!openaiKey) {
    return {
      ok: false,
      error: "whisper_not_configured",
      message: "Trascrizione non disponibile: OPENAI_API_KEY non configurata. " +
               "Per abilitarla: `firebase functions:secrets:set OPENAI_API_KEY` " +
               "e rideployare. Alternativa: usa la dettatura vocale (🎤) nella chat NEXUS.",
    };
  }

  // 1. Whisper transcription
  let transcript;
  try {
    transcript = await callWhisper(openaiKey, audioBuffer, fileName, mimeType);
  } catch (e) {
    logger.error("whisper failed", { error: String(e).slice(0, 300) });
    return { ok: false, error: "whisper_failed", detail: String(e).slice(0, 300) };
  }
  if (!transcript) return { ok: false, error: "empty_transcript" };

  // 2. Analyze with Haiku
  const anthropicKey = ANTHROPIC_API_KEY.value();
  let analysis = {};
  if (anthropicKey) {
    try {
      analysis = await analyzeTranscript(anthropicKey, transcript);
    } catch (e) {
      logger.warn("analysis failed", { error: String(e).slice(0, 200) });
      analysis = { riepilogo: transcript.slice(0, 200), _analysisError: String(e).slice(0, 200) };
    }
  } else {
    analysis = { riepilogo: transcript.slice(0, 200), _analysisError: "no_anthropic_key" };
  }

  // 3. Salva in Firestore
  const docRef = db.collection("nexus_audio_transcripts").doc();
  await docRef.set({
    id: docRef.id,
    userId: userId || null,
    sessionId: sessionId || null,
    fileName: fileName || null,
    mimeType: mimeType || null,
    fileSize: audioBuffer.length,
    transcript,
    analysis,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    transcriptId: docRef.id,
    text: transcript,
    analysis,
    formatted: formatAnalysis(transcript, analysis, docRef.id),
  };
}
