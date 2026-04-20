/**
 * NexusRouter — interpreta il messaggio dell'utente e decide il routing.
 *
 * Questo modulo è usato SOLO server-side (Cloud Function / script).
 * La API key Anthropic NON deve mai finire nel bundle PWA.
 *
 * Pipeline:
 *   1. Costruisce prompt con history + messaggio nuovo.
 *   2. Chiama Claude Haiku chiedendo JSON strict.
 *   3. Valida il JSON contro `COLLEGHI_ROUTABLE` e schema minimo.
 *   4. Normalizza confidence, azione, parametri.
 *   5. Ritorna l'intent per il caller (che lo persisterà + Lavagna).
 */

import type { NexusIntent, NexusMessage } from "./types.js";
import { COLLEGHI_ROUTABLE } from "./types.js";

export const NEXUS_SYSTEM_PROMPT = `Sei NEXUS, l'interfaccia conversazionale di NEXO per ACG Clima Service (manutenzione HVAC, zona Alessandria/Voghera/Tortona).

L'utente ti parla in linguaggio naturale. Il tuo compito:
1. Capire cosa vuole.
2. Scegliere UN Collega competente (tra quelli elencati).
3. Formulare l'azione e i parametri per quel Collega.
4. Rispondere all'utente in italiano confermando cosa stai facendo.

COLLEGHI DISPONIBILI (scegli ESATTAMENTE uno di questi slug):
- iris       → email in arrivo: classificazione, ricerca, regole, thread, follow-up
- echo       → comunicazioni in uscita: WA, Telegram, email, notifiche, voce
- ares       → interventi tecnici: apri, assegna, chiudi, RTI
- chronos    → calendario: slot, agende tecnici, scadenze, campagne
- memo       → dossier cliente, storico impianti, ricerca documenti
- charta     → fatture, incassi, pagamenti, DDT, solleciti
- emporion   → magazzino: giacenze, furgoni, ordini, listini
- dikea      → compliance: CURIT, F-Gas, DiCo, PEC, GDPR
- delphi     → analisi: KPI, margini, trend, report
- pharo      → monitoring: alert, heartbeat, budget, anomalie
- calliope   → content: bozze email, preventivi, solleciti, PEC
- nessuno    → solo se la richiesta non coinvolge alcun Collega (es. saluti, chiarimenti)

AZIONE: stringa snake_case che descrive cosa fare (es. "cerca_email_urgenti",
"apri_intervento", "dossier_cliente", "fatture_scadute"). Non inventare
azioni che il Collega non potrebbe fare.

PARAMETRI: oggetto JSON con i dati estratti (mittente, cliente, condominio,
data, importo, targa, …). Se mancano dati cruciali, chiedi chiarimento in
"rispostaUtente" invece di inventare.

CONFIDENZA: 0-1. Basso = la richiesta è ambigua.

RISPOSTA UTENTE: 1-2 frasi in italiano. Conversazionale, non formale.
Esempi buoni:
  - "Capito. Passo la richiesta ad ARES per l'intervento."
  - "Chiedo a IRIS quante email urgenti hai in coda."
  - "Mi serve un chiarimento: quale condominio?"

REGOLE:
- Rispondi SOLO con un oggetto JSON valido. Niente code fence, niente testo
  prima o dopo.
- Non inventare clienti, importi, condomini o date. Se mancano, chiedi.
- Se la richiesta coinvolge più Colleghi, scegli il Collega PRIMARIO (il
  primo nella catena) e elenca gli altri in "steps".
- Se non capisci la richiesta, metti collega = "nessuno", confidenza bassa,
  e chiedi chiarimento in "rispostaUtente".

FORMATO OUTPUT (JSON rigoroso):
{
  "collega": "<slug>",
  "azione": "<snake_case>",
  "parametri": { ... },
  "confidenza": 0.0-1.0,
  "rispostaUtente": "<testo italiano>",
  "reasoning": "<1 frase debug>",
  "steps": [  // opzionale, solo per multi-step
    { "collega": "...", "azione": "...", "parametri": { ... } }
  ]
}`;

export interface NexusRouterOptions {
  apiKey: string;
  modello?: string;
  maxTokens?: number;
  /** Override fetch (per test). */
  fetchImpl?: typeof fetch;
}

export interface InterpretInput {
  userMessage: string;
  /** Ultimi N messaggi (in ordine cronologico). */
  history?: Array<Pick<NexusMessage, "role" | "content">>;
}

export interface InterpretResult {
  intent: NexusIntent;
  raw: string;
  usage: { inputTokens: number; outputTokens: number };
  modello: string;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";

export class NexusRouter {
  private readonly apiKey: string;
  private readonly modello: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: NexusRouterOptions) {
    this.apiKey = opts.apiKey;
    this.modello = opts.modello ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? 512;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async interpret(input: InterpretInput): Promise<InterpretResult> {
    const messages = this.buildMessages(input);

    const resp = await this.fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.modello,
        max_tokens: this.maxTokens,
        system: NEXUS_SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await resp.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const raw = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();

    const intent = parseAndValidate(raw, input.userMessage);

    return {
      intent,
      raw,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      modello: this.modello,
    };
  }

  private buildMessages(
    input: InterpretInput,
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const out: Array<{ role: "user" | "assistant"; content: string }> = [];
    const hist = (input.history ?? []).slice(-10);
    for (const h of hist) {
      if (h.role === "user" || h.role === "assistant") {
        out.push({ role: h.role, content: h.content });
      }
    }
    out.push({ role: "user", content: input.userMessage });
    return out;
  }
}

// ─── Parser + validator (puro, testabile) ───────────────────────

const VALID_COLLEGHI = new Set<string>([...COLLEGHI_ROUTABLE, "nessuno", "multi"]);

export function parseAndValidate(raw: string, userMessage: string): NexusIntent {
  const jsonStr = extractJSON(raw);
  if (!jsonStr) {
    return fallbackIntent(`Non sono riuscito a interpretare la richiesta: "${userMessage}".`);
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    return fallbackIntent(`Risposta dal modello non valida. Riprova.`);
  }

  const collegaRaw = String(obj.collega ?? "").toLowerCase().trim();
  const collega = VALID_COLLEGHI.has(collegaRaw) ? collegaRaw : "nessuno";

  const azione = String(obj.azione ?? "").trim() || "nessuna";
  const parametri = (obj.parametri && typeof obj.parametri === "object")
    ? (obj.parametri as Record<string, unknown>)
    : {};
  let confidenza = Number(obj.confidenza);
  if (!Number.isFinite(confidenza)) confidenza = 0;
  confidenza = Math.max(0, Math.min(1, confidenza));

  const rispostaUtente = String(obj.rispostaUtente ?? "").trim()
    || "Ho ricevuto, sto elaborando.";

  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : undefined;

  let steps: NexusIntent["steps"];
  if (Array.isArray(obj.steps)) {
    steps = [];
    for (const s of obj.steps) {
      if (!s || typeof s !== "object") continue;
      const sObj = s as Record<string, unknown>;
      const sColl = String(sObj.collega ?? "").toLowerCase();
      if (!COLLEGHI_ROUTABLE.includes(sColl as (typeof COLLEGHI_ROUTABLE)[number])) continue;
      steps.push({
        collega: sColl as (typeof COLLEGHI_ROUTABLE)[number],
        azione: String(sObj.azione ?? "nessuna"),
        parametri: (sObj.parametri && typeof sObj.parametri === "object")
          ? (sObj.parametri as Record<string, unknown>)
          : {},
      });
    }
    if (steps.length === 0) steps = undefined;
  }

  return {
    collega: collega as NexusIntent["collega"],
    azione,
    parametri,
    confidenza,
    rispostaUtente,
    reasoning,
    steps,
  };
}

function extractJSON(text: string): string | null {
  if (!text) return null;
  // Strip code fences se presenti (il prompt vieta ma il modello a volte li mette).
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const s = candidate.indexOf("{");
  const e = candidate.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  return candidate.slice(s, e + 1);
}

function fallbackIntent(rispostaUtente: string): NexusIntent {
  return {
    collega: "nessuno",
    azione: "chiarimento",
    parametri: {},
    confidenza: 0,
    rispostaUtente,
  };
}
