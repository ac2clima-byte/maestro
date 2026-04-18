/**
 * RuleEngine — motore di regole declarative per IRIS.
 *
 * Una regola è un documento Firestore in `iris_rules`:
 * {
 *   id: string,
 *   name: string,
 *   description?: string,
 *   enabled: boolean,
 *   priority: number,         // più alto = valutato prima
 *   conditions: RuleCondition[], // ALL conditions must match (AND)
 *   actions: RuleAction[],
 *   stopOnMatch?: boolean,    // default true: ferma valutazione dopo match
 *   createdAt, updatedAt
 * }
 *
 * Strategia:
 *   1. loadRules() ordina per priority desc.
 *   2. evaluate(email) ritorna { matchedRule, actions } della prima regola
 *      che matcha (oppure null).
 *   3. execute(email, actions) esegue ogni azione tramite l'ActionRunner
 *      iniettato (dependency-injected per testabilità).
 *
 * Il motore NON conosce direttamente Firestore o la Lavagna: li riceve
 * come dipendenze. Questo lo rende testabile e riusabile (in pipeline
 * Python via porting, o in PWA per dry-run preview).
 */
import type { ClassificationType, SentimentLevel, SuggestedAction } from "../types/classification.js";
import type { LavagnaPriority } from "../../../nexo-core/lavagna/types.js";

// ─── Conditions ──────────────────────────────────────────────────────

export type ConditionField =
  | "sender"
  | "subject"
  | "category"
  | "sentiment"
  | "suggestedAction"
  | "hasAttachments"
  | "attachmentType"
  | "score";

export type ConditionOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "matches"     // regex
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_true"
  | "is_false";

export interface RuleCondition {
  field: ConditionField;
  op: ConditionOp;
  value?: string | number | boolean | string[];
  /** case-insensitive per campi stringa (default true) */
  caseInsensitive?: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────

export type RuleActionType =
  | "write_lavagna"
  | "notify_echo"
  | "archive_email"
  | "set_priority"
  | "tag_email"
  | "extract_data";

export interface RuleAction {
  type: RuleActionType;
  /** target Lavagna (es. "ares", "charta", "dikea") per write_lavagna */
  to?: string;
  /** tipo messaggio Lavagna (es. "incassi_acg") per write_lavagna */
  messageType?: string;
  /** priorità Lavagna o priorità email per set_priority */
  priority?: LavagnaPriority;
  /** payload arbitrario per write_lavagna */
  payload?: Record<string, unknown>;
  /** canale ECHO ("wa" | "telegram" | "voice") */
  channel?: string;
  /** testo notifica per notify_echo */
  text?: string;
  /** tag list per tag_email */
  tags?: string[];
  /** patterns per extract_data, es. {"importo":"€\\s*([0-9.,]+)"} */
  extractPatterns?: Record<string, string>;
}

// ─── Rule ────────────────────────────────────────────────────────────

export interface IrisRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  stopOnMatch?: boolean;
}

// ─── Email shape (subset of IrisEmailDoc that the engine inspects) ──

export interface RuleEmailInput {
  id: string;
  raw: {
    sender: string;
    subject: string;
    body_text?: string;
    has_attachments?: boolean;
  };
  classification: {
    category: ClassificationType;
    sentiment?: SentimentLevel;
    suggestedAction?: SuggestedAction;
  };
  attachments?: Array<{
    detectedType?: string;
    amount?: string;
    extractedText?: string;
  }>;
  score?: number;
  /** Regole già applicate a questa email (per idempotenza) */
  appliedRules?: string[];
}

// ─── Evaluation result ──────────────────────────────────────────────

export interface EvaluationResult {
  matchedRule: IrisRule | null;
  actions: RuleAction[];
  /** se più regole matchano e stopOnMatch=false, qui ce ne sono altre */
  additionalMatches?: IrisRule[];
  /** dati estratti da extract_data condition (se presenti) */
  extractedData?: Record<string, string>;
}

// ─── Execution result ───────────────────────────────────────────────

export interface ActionExecutionResult {
  action: RuleAction;
  ok: boolean;
  detail?: string;
  error?: string;
}

export interface ExecutionResult {
  emailId: string;
  ruleId: string;
  results: ActionExecutionResult[];
  ok: boolean;
}

// ─── Action Runner (dependency-injected) ────────────────────────────

export interface ActionRunner {
  writeLavagna(args: {
    to: string;
    type: string;
    payload: Record<string, unknown>;
    priority: LavagnaPriority;
    sourceEmailId: string;
  }): Promise<{ id: string }>;

  notifyEcho(args: {
    channel: string;
    text: string;
    sourceEmailId: string;
  }): Promise<{ id: string }>;

  archiveEmail(args: { emailId: string }): Promise<void>;

  tagEmail(args: { emailId: string; tags: string[] }): Promise<void>;

  setEmailPriority(args: {
    emailId: string;
    priority: LavagnaPriority;
  }): Promise<void>;

  markRuleApplied(args: {
    emailId: string;
    ruleId: string;
  }): Promise<void>;
}

// ─── Rules loader ───────────────────────────────────────────────────

export interface RulesSource {
  loadEnabled(): Promise<IrisRule[]>;
}

// ─── Engine ─────────────────────────────────────────────────────────

export class RuleEngine {
  private rules: IrisRule[] = [];

  constructor(
    private readonly source: RulesSource,
    private readonly runner: ActionRunner,
  ) {}

  /** Loads rules from the source, sorts by priority desc. */
  async loadRules(): Promise<IrisRule[]> {
    const all = await this.source.loadEnabled();
    this.rules = all
      .filter((r) => r.enabled)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return this.rules;
  }

  /** In-memory rules (for tests / re-evaluation). */
  setRules(rules: IrisRule[]): void {
    this.rules = [...rules]
      .filter((r) => r.enabled)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  getRules(): IrisRule[] {
    return [...this.rules];
  }

  /** Evaluate all rules on a single email. Returns the first match (or null). */
  evaluate(email: RuleEmailInput): EvaluationResult {
    const additional: IrisRule[] = [];
    let firstMatch: IrisRule | null = null;
    let extracted: Record<string, string> | undefined;

    for (const rule of this.rules) {
      if (!matchAllConditions(email, rule.conditions)) continue;
      if (!firstMatch) {
        firstMatch = rule;
        // Extract data from extract_data actions (used by downstream actions)
        extracted = extractDataFromEmail(email, rule.actions);
        if (rule.stopOnMatch !== false) break;
      } else {
        additional.push(rule);
      }
    }

    return {
      matchedRule: firstMatch,
      actions: firstMatch ? firstMatch.actions : [],
      additionalMatches: additional,
      extractedData: extracted,
    };
  }

  /**
   * Execute matched actions for one email.
   * Skips re-execution if email.appliedRules already contains the ruleId
   * (idempotency guard).
   */
  async execute(
    email: RuleEmailInput,
    rule: IrisRule,
    extractedData?: Record<string, string>,
  ): Promise<ExecutionResult> {
    const results: ActionExecutionResult[] = [];

    if (email.appliedRules?.includes(rule.id)) {
      // Already applied to this email: no-op (avoids duplicate Lavagna writes).
      return {
        emailId: email.id,
        ruleId: rule.id,
        results: [{ action: { type: "tag_email" }, ok: true, detail: "already-applied" }],
        ok: true,
      };
    }

    for (const action of rule.actions) {
      try {
        const detail = await this.runAction(email, action, rule, extractedData);
        results.push({ action, ok: true, detail });
      } catch (e) {
        results.push({
          action,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Mark applied even if some sub-actions failed: we don't want to keep
    // re-running successful side-effects on every pipeline run.
    try {
      await this.runner.markRuleApplied({ emailId: email.id, ruleId: rule.id });
    } catch (e) {
      results.push({
        action: { type: "tag_email" },
        ok: false,
        error: `mark applied failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    return {
      emailId: email.id,
      ruleId: rule.id,
      results,
      ok: results.every((r) => r.ok),
    };
  }

  private async runAction(
    email: RuleEmailInput,
    action: RuleAction,
    rule: IrisRule,
    extractedData?: Record<string, string>,
  ): Promise<string> {
    switch (action.type) {
      case "write_lavagna": {
        if (!action.to) throw new Error("write_lavagna requires 'to'");
        const payload = {
          ...(action.payload ?? {}),
          ...(extractedData ?? {}),
          emailId: email.id,
          subject: email.raw.subject,
          sender: email.raw.sender,
          ruleId: rule.id,
          ruleName: rule.name,
        };
        const r = await this.runner.writeLavagna({
          to: action.to,
          type: action.messageType ?? "iris_event",
          payload,
          priority: action.priority ?? "normal",
          sourceEmailId: email.id,
        });
        return `lavagna:${r.id} → ${action.to}`;
      }
      case "notify_echo": {
        const text = action.text ?? defaultNotifyText(email, rule);
        const r = await this.runner.notifyEcho({
          channel: action.channel ?? "wa",
          text,
          sourceEmailId: email.id,
        });
        return `echo:${action.channel ?? "wa"}:${r.id}`;
      }
      case "archive_email": {
        await this.runner.archiveEmail({ emailId: email.id });
        return "archived";
      }
      case "tag_email": {
        await this.runner.tagEmail({ emailId: email.id, tags: action.tags ?? [] });
        return `tagged:${(action.tags ?? []).join(",")}`;
      }
      case "set_priority": {
        await this.runner.setEmailPriority({
          emailId: email.id,
          priority: action.priority ?? "normal",
        });
        return `priority:${action.priority ?? "normal"}`;
      }
      case "extract_data": {
        // Already processed in evaluate() and merged into Lavagna payload.
        // Nothing to do here at execution time.
        return "extracted (in-evaluate)";
      }
      default: {
        // Exhaustiveness: surface unsupported action types loudly.
        const _exhaustive: never = action.type;
        throw new Error(`Unsupported action type: ${_exhaustive}`);
      }
    }
  }
}

// ─── Pure helpers (testable in isolation) ───────────────────────────

function defaultNotifyText(email: RuleEmailInput, rule: IrisRule): string {
  return `[IRIS · ${rule.name}] ${email.raw.subject || "(senza oggetto)"} — ${email.raw.sender}`;
}

export function matchAllConditions(
  email: RuleEmailInput,
  conditions: RuleCondition[],
): boolean {
  if (!conditions || conditions.length === 0) return false;
  return conditions.every((c) => matchOne(email, c));
}

function fieldValue(email: RuleEmailInput, field: ConditionField): unknown {
  switch (field) {
    case "sender": return email.raw.sender ?? "";
    case "subject": return email.raw.subject ?? "";
    case "category": return email.classification.category;
    case "sentiment": return email.classification.sentiment ?? "neutro";
    case "suggestedAction": return email.classification.suggestedAction;
    case "hasAttachments":
      return Boolean(email.raw.has_attachments) || (email.attachments?.length ?? 0) > 0;
    case "attachmentType": {
      // returns array of attachment types
      return (email.attachments ?? []).map((a) => a.detectedType ?? "");
    }
    case "score": return email.score ?? 0;
  }
}

function matchOne(email: RuleEmailInput, c: RuleCondition): boolean {
  const raw = fieldValue(email, c.field);
  const ci = c.caseInsensitive !== false;
  const norm = (v: unknown): string =>
    ci ? String(v ?? "").toLowerCase() : String(v ?? "");

  switch (c.op) {
    case "equals":
      return Array.isArray(raw)
        ? raw.some((x) => norm(x) === norm(c.value))
        : norm(raw) === norm(c.value);

    case "not_equals":
      return Array.isArray(raw)
        ? !raw.some((x) => norm(x) === norm(c.value))
        : norm(raw) !== norm(c.value);

    case "contains":
      if (Array.isArray(raw)) return raw.some((x) => norm(x).includes(norm(c.value)));
      return norm(raw).includes(norm(c.value));

    case "not_contains":
      if (Array.isArray(raw)) return !raw.some((x) => norm(x).includes(norm(c.value)));
      return !norm(raw).includes(norm(c.value));

    case "in": {
      const arr = Array.isArray(c.value) ? c.value.map(String) : [String(c.value ?? "")];
      const arrN = arr.map((v) => (ci ? v.toLowerCase() : v));
      if (Array.isArray(raw)) return raw.some((x) => arrN.includes(norm(x)));
      return arrN.includes(norm(raw));
    }
    case "not_in": {
      const arr = Array.isArray(c.value) ? c.value.map(String) : [String(c.value ?? "")];
      const arrN = arr.map((v) => (ci ? v.toLowerCase() : v));
      if (Array.isArray(raw)) return !raw.some((x) => arrN.includes(norm(x)));
      return !arrN.includes(norm(raw));
    }

    case "matches": {
      try {
        const re = new RegExp(String(c.value ?? ""), ci ? "i" : "");
        if (Array.isArray(raw)) return raw.some((x) => re.test(String(x ?? "")));
        return re.test(String(raw ?? ""));
      } catch {
        return false;
      }
    }

    case "gt":  return Number(raw) >  Number(c.value);
    case "gte": return Number(raw) >= Number(c.value);
    case "lt":  return Number(raw) <  Number(c.value);
    case "lte": return Number(raw) <= Number(c.value);

    case "is_true":  return Boolean(raw) === true;
    case "is_false": return Boolean(raw) === false;
  }
}

/**
 * Run extract_data actions inline (during evaluate) so the extracted
 * fields are already available when write_lavagna runs.
 *
 * Patterns are JS regex strings; first capture group becomes the value.
 * Searches: body_text, subject, attachments.extractedText.
 */
export function extractDataFromEmail(
  email: RuleEmailInput,
  actions: RuleAction[],
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  let any = false;
  const haystacks: string[] = [
    email.raw.subject ?? "",
    email.raw.body_text ?? "",
    ...(email.attachments ?? []).map((a) => a.extractedText ?? ""),
  ];
  for (const action of actions) {
    if (action.type !== "extract_data") continue;
    const patterns = action.extractPatterns ?? {};
    for (const [key, pat] of Object.entries(patterns)) {
      try {
        const re = new RegExp(pat, "i");
        for (const h of haystacks) {
          const m = re.exec(h);
          if (m) {
            out[key] = m[1] ?? m[0];
            any = true;
            break;
          }
        }
      } catch {
        // Bad regex — skip silently.
      }
    }
  }
  return any ? out : undefined;
}
