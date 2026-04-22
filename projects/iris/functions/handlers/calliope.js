// handlers/calliope.js — bozze via Claude Sonnet (DRY-RUN).
import {
  ANTHROPIC_API_KEY, ANTHROPIC_URL, db, FieldValue, logger,
  fetchIrisEmails,
} from "./shared.js";

const CALLIOPE_MODEL = "claude-sonnet-4-6";
const CALLIOPE_SYSTEM_PROMPT = `Sei l'assistente di Alberto Contardi, titolare di ACG Clima Service (manutenzione HVAC, Piemonte). Scrivi bozze email professionali in italiano.

REGOLE:
- Tono cordiale ma professionale, conciso. Non smielato.
- Italiano corretto, niente anglicismi inutili.
- Non inventare fatti, importi, date o appuntamenti non presenti nel contesto.
- Se mancano informazioni cruciali, chiedile esplicitamente nella bozza.
- Firma con "Cordiali saluti,\\nAlberto Contardi\\nACG Clima Service".

OUTPUT: solo il testo della bozza. Niente preambolo, niente markdown. Max 1500 caratteri.`;

export async function handleCalliopeBozza(parametri, ctx) {
  const emailId = String(parametri.emailId || parametri.id || "").trim();
  const tono = String(parametri.tono || parametri.tone || "cordiale").trim();
  const note = String(parametri.note || parametri.istruzioni || "").trim();

  if (emailId && /^[A-Za-z0-9_-]{10,}$/.test(emailId)) {
    return generaBozzaFromEmail(emailId, tono, note);
  }

  let query = String(
    parametri.mittente || parametri.email || parametri.destinatario || parametri.a || parametri.to || "",
  ).trim();
  if (!query && ctx?.userMessage) {
    const m = /(?:a|per|rispondi(?:amo)?\s+a|bozza\s+a|scrivi.*a)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ.\s]{2,50})$/i.exec(ctx.userMessage.trim());
    if (m) query = m[1].trim();
  }
  if (!query) {
    return { content: "Per generare una bozza mi serve il mittente. Prova: 'scrivi una risposta cordiale a Rossi'." };
  }

  const emails = await fetchIrisEmails(200);
  const q = query.toLowerCase();
  const match = emails.find(e =>
    `${e.sender} ${e.senderName} ${e.subject}`.toLowerCase().includes(q),
  );
  if (!match) return { content: `Non trovo email recenti correlate a "${query}".` };
  return generaBozzaFromEmail(match.id, tono, note);
}

async function generaBozzaFromEmail(emailId, tono, note) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return { content: "CALLIOPE non configurato (ANTHROPIC_API_KEY mancante)." };

  let snap;
  try { snap = await db.collection("iris_emails").doc(emailId).get(); }
  catch { return { content: `Email "${emailId}" non leggibile.` }; }
  if (!snap.exists) return { content: `Email "${emailId}" non trovata.` };

  const data = snap.data() || {};
  const raw = data.raw || {};
  const cls = data.classification || {};

  const userPrompt = [
    `=== EMAIL DA RISCONTRARE ===`,
    `Da: ${raw.sender_name || raw.sender || "?"}`,
    `Oggetto: ${raw.subject || "(nessun oggetto)"}`,
    ``,
    `Corpo:`,
    String(raw.body_text || "(corpo vuoto)").slice(0, 2000),
    ``,
    `=== CLASSIFICAZIONE IRIS ===`,
    `Categoria: ${cls.category || "—"}`,
    `Riassunto: ${cls.summary || "—"}`,
    ``,
    `=== ISTRUZIONI ===`,
    `Tono richiesto: ${tono}`,
    note ? `Note: ${note}` : "",
    ``,
    `Scrivi ora la bozza di risposta.`,
  ].filter(Boolean).join("\n");

  let corpo, usage;
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CALLIOPE_MODEL,
        max_tokens: 1024,
        system: CALLIOPE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { content: `CALLIOPE: errore modello (${resp.status}): ${text.slice(0, 200)}` };
    }
    const json = await resp.json();
    corpo = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    usage = json.usage || {};
  } catch (e) {
    return { content: `CALLIOPE: chiamata fallita — ${String(e).slice(0, 200)}` };
  }

  const bozzaId = `boz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await db.collection("calliope_bozze").doc(bozzaId).set({
      id: bozzaId,
      tipo: "risposta_email",
      tono,
      stato: "in_revisione",
      versione: 1,
      corrente: {
        versione: 1,
        corpo,
        oggetto: `Re: ${raw.subject || ""}`.slice(0, 150),
        firma: "Cordiali saluti,\nAlberto Contardi\nACG Clima Service",
        generataIl: new Date().toISOString(),
        generataDa: "ai",
        modello: CALLIOPE_MODEL,
        usage: {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
        },
      },
      contesto: { richiedente: "nexus", sourceEmailId: emailId, note },
      destinatario: raw.sender ? {
        canale: "email", to: raw.sender, nome: raw.sender_name || null,
      } : null,
      _dryRun: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.error("calliope save failed", { error: String(e) });
  }

  return {
    content:
      `✍️ **Bozza CALLIOPE** (DRY-RUN, tono: ${tono}, salvata come \`${bozzaId}\`)\n\n` +
      `**A:** ${raw.sender_name || raw.sender}\n` +
      `**Oggetto:** Re: ${raw.subject || ""}\n\n` +
      `---\n${corpo}\n---\n\n` +
      `_⚠️ DRY-RUN: la bozza NON è stata inviata. Rivedila e approva quando sei pronto._`,
    data: { bozzaId, modello: CALLIOPE_MODEL, usage },
  };
}
