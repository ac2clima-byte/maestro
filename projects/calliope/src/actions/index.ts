/**
 * CALLIOPE — azioni esposte.
 *
 * v0.1 implementato:
 *   · bozzaRisposta(emailId, tono, ctx) — genera una bozza via Claude Sonnet.
 *     DRY_RUN di default: la bozza NON viene inviata; viene salvata in
 *     `calliope_bozze` con stato "in_revisione" per approvazione umana.
 */
import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";
import type {
  Bozza,
  StileDestinatario,
  Template,
  TipoBozza,
  ToneBozza,
} from "../types/index.js";

const NEXO_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "nexo-hub-15f2d";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";

function getOrInit(name: string, projectId: string): App {
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (name === "[DEFAULT]") {
    return initializeApp({ credential: applicationDefault(), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId }, name);
}
function nexoDb(): Firestore {
  return getFirestore(getOrInit("[DEFAULT]", NEXO_PROJECT_ID));
}

function isDryRun(): boolean {
  return (process.env.CALLIOPE_DRY_RUN ?? process.env.DRY_RUN ?? "true")
    .toLowerCase() === "true";
}

function makeId(prefix = "boz"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const SYSTEM_PROMPT_BOZZA = `Sei l'assistente di Alberto Contardi, titolare di ACG Clima Service (manutenzione HVAC, Piemonte). Scrivi bozze email professionali in italiano.

REGOLE:
- Tono cordiale ma professionale, conciso. Non smielato.
- Italiano corretto, niente anglicismi inutili.
- Non inventare fatti, importi, date o appuntamenti non presenti nel contesto.
- Se mancano informazioni cruciali, chiedile esplicitamente nella bozza.
- Firma con "Cordiali saluti,\\nAlberto Contardi\\nACG Clima Service".

OUTPUT: solo il testo della bozza. Niente preambolo, niente markdown. Max 1500 caratteri.`;

// ─── Bozze specifiche ───────────────────────────────────────────

export interface BozzaContesto {
  sourceEmailId?: string;
  sourceLavagnaId?: string;
  clienteId?: string;
  note?: string;
}

/**
 * Genera una bozza di risposta email via Claude Sonnet.
 *
 * DRY_RUN di default: la bozza è salvata in `calliope_bozze` con stato
 * "in_revisione" — Alberto deve approvarla prima che ECHO la invii.
 *
 * Env:
 *   ANTHROPIC_API_KEY — required
 *   CALLIOPE_MODEL    — opzionale (default claude-sonnet-4-6)
 *   CALLIOPE_DRY_RUN  — "false" per auto-approvare (sconsigliato)
 */
export async function bozzaRisposta(
  emailId: string,
  tono: ToneBozza,
  contesto: BozzaContesto = {},
): Promise<Bozza> {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    throw new Error("CALLIOPE: ANTHROPIC_API_KEY mancante");
  }

  const db = nexoDb();

  // Carica l'email originale
  let emailData: Record<string, unknown> = {};
  try {
    const snap = await db.collection("iris_emails").doc(emailId).get();
    if (snap.exists) emailData = snap.data() || {};
  } catch {}
  const raw = (emailData.raw || {}) as Record<string, unknown>;
  const cls = (emailData.classification || {}) as Record<string, unknown>;

  const userPrompt = [
    `=== EMAIL DA RISCONTRARE ===`,
    `Da: ${raw.sender_name || raw.sender || "?"}`,
    `Oggetto: ${raw.subject || "(nessun oggetto)"}`,
    ``,
    `Corpo:`,
    String(raw.body_text || "(corpo vuoto)"),
    ``,
    `=== CLASSIFICAZIONE IRIS ===`,
    `Categoria: ${cls.category || "—"}`,
    `Riassunto: ${cls.summary || "—"}`,
    ``,
    `=== ISTRUZIONI ===`,
    `Tono richiesto: ${tono}`,
    contesto.note ? `Note aggiuntive: ${contesto.note}` : "",
    ``,
    `Scrivi ora la bozza di risposta.`,
  ].filter(Boolean).join("\n");

  const modello = process.env.CALLIOPE_MODEL || DEFAULT_MODEL;

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modello,
      max_tokens: 1024,
      system: SYSTEM_PROMPT_BOZZA,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const json = await resp.json() as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const corpo = (json.content || [])
    .filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();

  const id = makeId("boz");
  const nowIso = new Date().toISOString();

  const bozza: Bozza = {
    id,
    tipo: "risposta_email" as TipoBozza,
    tono,
    stato: isDryRun() ? "in_revisione" : "pronta",
    versione: 1,
    corrente: {
      versione: 1,
      corpo,
      oggetto: `Re: ${raw.subject || ""}`.slice(0, 150),
      firma: "Cordiali saluti,\nAlberto Contardi\nACG Clima Service",
      generataIl: nowIso,
      generataDa: "ai",
      modello,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    },
    contesto: {
      richiedente: "nexus",
      sourceEmailId: emailId,
      sourceLavagnaId: contesto.sourceLavagnaId,
      clienteId: contesto.clienteId,
      note: contesto.note,
    },
    destinatario: raw.sender ? {
      canale: "email",
      to: String(raw.sender),
      nome: raw.sender_name as string | undefined,
    } : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Persisti in calliope_bozze
  try {
    await db.collection("calliope_bozze").doc(id).set({
      ...bozza,
      _dryRun: isDryRun(),
      _serverTime: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[calliope] save failed: ${(e as Error).message}`);
  }

  return bozza;
}

export async function comunicazioneCondominio(
  _condominioId: string,
  _motivo: string,
  _dati: Record<string, unknown> = {},
): Promise<Bozza> {
  throw new Error("Not implemented: comunicazioneCondominio");
}

export interface PreventivoFormaleInput {
  impiantoId?: string;
  clienteId?: string;
  lavoro: string;
  voci?: Array<{ descrizione: string; quantita: number; prezzoUnitario: number }>;
  templateId?: string;
}

export async function preventivoFormale(_input: PreventivoFormaleInput): Promise<Bozza> {
  throw new Error("Not implemented: preventivoFormale");
}

export async function sollecitoPagamento(
  _fatturaId: string,
  _tono: Extract<ToneBozza, "cordiale" | "fermo" | "ultimativo">,
): Promise<Bozza> {
  throw new Error("Not implemented: sollecitoPagamento");
}

export async function rispostaPEC(_pecId: string): Promise<Bozza> {
  throw new Error("Not implemented: rispostaPEC");
}

export async function offertaCommerciale(
  _clienteId: string,
  _lavoro: string,
  _opts: { templateId?: string } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: offertaCommerciale");
}

export async function newsletterTecnici(_yyyymm: string): Promise<Bozza> {
  throw new Error("Not implemented: newsletterTecnici");
}

export interface ComunicazioneMassivaInput {
  argomento: string;
  destinatari: Array<{ canale: "email" | "whatsapp" | "pec"; to: string; variabili?: Record<string, string> }>;
  templateId?: string;
  tono?: ToneBozza;
}

export async function comunicazioneMassiva(
  _input: ComunicazioneMassivaInput,
): Promise<{ bozzaId: string; totaleDestinatari: number }> {
  throw new Error("Not implemented: comunicazioneMassiva");
}

// ─── Trascrizioni ───────────────────────────────────────────────

export async function trascriviAudio(
  _audioRef: string,
  _opts: { lingua?: string; modello?: string } = {},
): Promise<{ testo: string; durataSec?: number; segmenti?: Array<{ start: number; end: number; testo: string }> }> {
  throw new Error("Not implemented: trascriviAudio");
}

export async function verbaleRiunione(
  _audioRef: string,
): Promise<{ trascrizione: string; riassunto: string; actionItems: Array<{ chi?: string; cosa: string; quando?: string }> }> {
  throw new Error("Not implemented: verbaleRiunione");
}

// ─── Ciclo di vita ──────────────────────────────────────────────

export async function revisiona(
  _bozzaId: string,
  _feedback: string,
): Promise<Bozza> {
  throw new Error("Not implemented: revisiona");
}

export async function approva(
  _bozzaId: string,
  _opts: { approvataDa?: string; motivazione?: string } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: approva");
}

export async function rifiuta(
  _bozzaId: string,
  _motivo: string,
  _opts: { rifiutataDa?: string } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: rifiuta");
}

// ─── Template ───────────────────────────────────────────────────

export async function listaTemplate(
  _opts: { tipo?: TipoBozza; attivi?: boolean } = {},
): Promise<Template[]> {
  throw new Error("Not implemented: listaTemplate");
}

export interface CreaTemplateInput {
  nome: string;
  tipo: TipoBozza;
  descrizione?: string;
  corpo: string;
  oggetto?: string;
  firma?: string;
  variabiliRichieste?: Template["variabiliRichieste"];
  toneConsigliato?: ToneBozza;
}

export async function creaTemplate(_input: CreaTemplateInput): Promise<Template> {
  throw new Error("Not implemented: creaTemplate");
}

export async function generaDaTemplate(
  _templateId: string,
  _variabili: Record<string, string>,
  _opts: { tono?: ToneBozza; contesto?: BozzaContesto } = {},
): Promise<Bozza> {
  throw new Error("Not implemented: generaDaTemplate");
}

// ─── Apprendimento stile ────────────────────────────────────────

export interface EsempioStile {
  corpo: string;
  destinatarioTipo?: StileDestinatario["soggettoTipo"];
  autore?: string;
}

export async function imparaStile(
  _esempi: EsempioStile[],
  _opts: { soggettoId?: string; soggettoTipo?: StileDestinatario["soggettoTipo"] } = {},
): Promise<StileDestinatario> {
  throw new Error("Not implemented: imparaStile");
}
