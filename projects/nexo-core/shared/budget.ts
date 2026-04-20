/**
 * budget — guard condiviso sul budget Anthropic giornaliero.
 *
 * Tutti i Colleghi che chiamano un LLM dovrebbero invocare
 * `canSpend(stimaTokens)` PRIMA della richiesta e `registraSpesa(...)`
 * DOPO il response.
 *
 *   const budget = new BudgetGuard({ db, collega: "iris" });
 *   const { allowed, reason } = await budget.canSpend({
 *     stimaInputTokens: 2500, stimaOutputTokens: 400, modello: "haiku-4-5",
 *   });
 *   if (!allowed) throw new BudgetExceededError(reason);
 *   // ... chiamata API ...
 *   await budget.registraSpesa({
 *     inputTokens: actual.in, outputTokens: actual.out, modello,
 *   });
 *
 * Persistenza Firestore:
 *   nexo_budget/{yyyymmdd} = {
 *     date: "2026-04-20",
 *     spesoEur: 0.45,
 *     tokensInput: 12345, tokensOutput: 2345,
 *     perCollega: { iris: {...}, dikea: {...}, ... },
 *     perModello: { "claude-haiku-4-5": {...}, ... },
 *     updatedAt,
 *   }
 *
 * Soglia giornaliera: `NEXO_BUDGET_DAILY_EUR` (default `BUDGET_DEFAULT_DAILY_EUR`).
 * Quando superata: `canSpend` ritorna `allowed: false`.
 */
import type { Firestore } from "firebase-admin/firestore";

export const BUDGET_COLLECTION = "nexo_budget";

/** Default giornaliero se `NEXO_BUDGET_DAILY_EUR` non è settato. */
export const BUDGET_DEFAULT_DAILY_EUR = 5.0;

/**
 * Prezzi approssimativi per 1M token.
 *
 * Fonti: pricing Anthropic documentato, arrotondato per calcoli di
 * preflight (non fiscale). Sovrascrivibile via costruttore.
 */
export const DEFAULT_MODEL_PRICING: Record<string, { in: number; out: number }> = {
  // Haiku 4.5
  "claude-haiku-4-5": { in: 0.80, out: 4.00 },
  "claude-haiku-4-5-20251001": { in: 0.80, out: 4.00 },
  // Sonnet 4.5 / 4.6
  "claude-sonnet-4-5": { in: 3.00, out: 15.00 },
  "claude-sonnet-4-6": { in: 3.00, out: 15.00 },
  // Opus 4.7
  "claude-opus-4-7": { in: 15.00, out: 75.00 },
};

export interface BudgetGuardOptions {
  db: Firestore;
  collega: string;
  /** Override budget EUR/giorno (priorità massima). */
  dailyBudgetEur?: number;
  /** Override pricing per modello. */
  pricing?: Record<string, { in: number; out: number }>;
  /** Override clock (per test). */
  now?: () => Date;
}

export interface CanSpendInput {
  modello: string;
  stimaInputTokens: number;
  stimaOutputTokens: number;
}

export interface CanSpendResult {
  allowed: boolean;
  costoStimatoEur: number;
  /** Budget residuo dopo la spesa prevista. */
  residuoDopoEur: number;
  budgetGiornalieroEur: number;
  reason?: string;
}

export interface RegistraSpesaInput {
  modello: string;
  inputTokens: number;
  outputTokens: number;
  /** Note opzionali (es. id dell'email / intervento che ha generato la call). */
  meta?: Record<string, unknown>;
}

export interface SpesoOggiResult {
  date: string;            // yyyy-mm-dd
  spesoEur: number;
  budgetEur: number;
  percentuale: number;
  residuoEur: number;
  oltreSoglia: boolean;
  tokensInput: number;
  tokensOutput: number;
  perCollega: Record<string, { spesoEur: number; tokensInput: number; tokensOutput: number }>;
  perModello: Record<string, { spesoEur: number; tokensInput: number; tokensOutput: number; chiamate: number }>;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

function dayKey(d: Date): string {
  // yyyy-mm-dd UTC. Ridurre a UTC evita rotazioni bizzarre su DST locale.
  return d.toISOString().slice(0, 10);
}

function dayDocId(d: Date): string {
  return dayKey(d).replace(/-/g, ""); // yyyymmdd → Firestore-safe
}

function costoEur(
  pricing: Record<string, { in: number; out: number }>,
  modello: string,
  inTok: number,
  outTok: number,
): number {
  const p = pricing[modello];
  if (!p) return 0; // modello sconosciuto: non bloccare, ma non contare
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
}

export class BudgetGuard {
  private readonly db: Firestore;
  private readonly collega: string;
  private readonly dailyBudget: number;
  private readonly pricing: Record<string, { in: number; out: number }>;
  private readonly now: () => Date;

  constructor(opts: BudgetGuardOptions) {
    this.db = opts.db;
    this.collega = opts.collega;
    const envBudget = Number(process.env.NEXO_BUDGET_DAILY_EUR);
    this.dailyBudget = opts.dailyBudgetEur
      ?? (Number.isFinite(envBudget) && envBudget > 0 ? envBudget : BUDGET_DEFAULT_DAILY_EUR);
    this.pricing = opts.pricing ?? DEFAULT_MODEL_PRICING;
    this.now = opts.now ?? (() => new Date());
  }

  /** Verifica se la spesa stimata rientra nel budget giornaliero. */
  async canSpend(input: CanSpendInput): Promise<CanSpendResult> {
    const costoStimatoEur = costoEur(
      this.pricing, input.modello, input.stimaInputTokens, input.stimaOutputTokens,
    );
    const stato = await this.spesoOggi();
    const nuovoSpeso = stato.spesoEur + costoStimatoEur;
    const residuoDopoEur = Math.max(0, this.dailyBudget - nuovoSpeso);
    const allowed = nuovoSpeso <= this.dailyBudget;
    return {
      allowed,
      costoStimatoEur,
      residuoDopoEur,
      budgetGiornalieroEur: this.dailyBudget,
      reason: allowed ? undefined :
        `budget giornaliero superato: già speso ${stato.spesoEur.toFixed(4)} €, ` +
        `stima ${costoStimatoEur.toFixed(4)} €, limite ${this.dailyBudget} €`,
    };
  }

  /** Registra il consumo effettivo sul doc del giorno (atomico). */
  async registraSpesa(input: RegistraSpesaInput): Promise<void> {
    const now = this.now();
    const docId = dayDocId(now);
    const costo = costoEur(this.pricing, input.modello, input.inputTokens, input.outputTokens);

    const ref = this.db.collection(BUDGET_COLLECTION).doc(docId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? (snap.data() as Partial<SpesoOggiResult>) : null;
      const perCollega = { ...(prev?.perCollega ?? {}) };
      const perModello = { ...(prev?.perModello ?? {}) };

      const mine = perCollega[this.collega] ?? { spesoEur: 0, tokensInput: 0, tokensOutput: 0 };
      perCollega[this.collega] = {
        spesoEur: (mine.spesoEur || 0) + costo,
        tokensInput: (mine.tokensInput || 0) + input.inputTokens,
        tokensOutput: (mine.tokensOutput || 0) + input.outputTokens,
      };

      const m = perModello[input.modello] ?? { spesoEur: 0, tokensInput: 0, tokensOutput: 0, chiamate: 0 };
      perModello[input.modello] = {
        spesoEur: (m.spesoEur || 0) + costo,
        tokensInput: (m.tokensInput || 0) + input.inputTokens,
        tokensOutput: (m.tokensOutput || 0) + input.outputTokens,
        chiamate: (m.chiamate || 0) + 1,
      };

      tx.set(ref, {
        date: dayKey(now),
        spesoEur: (prev?.spesoEur || 0) + costo,
        tokensInput: (prev?.tokensInput || 0) + input.inputTokens,
        tokensOutput: (prev?.tokensOutput || 0) + input.outputTokens,
        perCollega,
        perModello,
        updatedAt: new Date().toISOString(),
        ...(input.meta ? { ultimaMeta: input.meta } : {}),
      }, { merge: true });
    });
  }

  /** Stato corrente del budget per oggi. */
  async spesoOggi(): Promise<SpesoOggiResult> {
    const now = this.now();
    const docId = dayDocId(now);
    const snap = await this.db.collection(BUDGET_COLLECTION).doc(docId).get();
    const data = (snap.exists ? snap.data() : null) ?? {};
    const spesoEur = Number(data.spesoEur || 0);
    const percentuale = this.dailyBudget > 0
      ? Math.min(100, Math.round((spesoEur / this.dailyBudget) * 1000) / 10)
      : 0;
    return {
      date: dayKey(now),
      spesoEur,
      budgetEur: this.dailyBudget,
      percentuale,
      residuoEur: Math.max(0, this.dailyBudget - spesoEur),
      oltreSoglia: spesoEur > this.dailyBudget,
      tokensInput: Number(data.tokensInput || 0),
      tokensOutput: Number(data.tokensOutput || 0),
      perCollega: (data.perCollega as SpesoOggiResult["perCollega"]) ?? {},
      perModello: (data.perModello as SpesoOggiResult["perModello"]) ?? {},
    };
  }
}
