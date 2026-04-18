import { describe, it, expect } from "vitest";
import {
  RuleEngine,
  matchAllConditions,
  extractDataFromEmail,
  type IrisRule,
  type RuleEmailInput,
  type ActionRunner,
  type RulesSource,
} from "../src/rules/RuleEngine.js";

function emailFixture(overrides: Partial<RuleEmailInput> = {}): RuleEmailInput {
  return {
    id: overrides.id ?? "e1",
    raw: {
      sender: "test@x.it",
      subject: "test subject",
      body_text: "",
      has_attachments: false,
      ...(overrides.raw ?? {}),
    },
    classification: {
      category: "ALTRO",
      sentiment: "neutro",
      suggestedAction: "ARCHIVIA",
      ...(overrides.classification ?? {}),
    },
    attachments: overrides.attachments,
    score: overrides.score,
    appliedRules: overrides.appliedRules,
  };
}

class FakeRunner implements ActionRunner {
  log: string[] = [];
  async writeLavagna(args: any) {
    this.log.push(`lavagna:${args.to}:${args.type}:${JSON.stringify(args.payload)}`);
    return { id: "lav1" };
  }
  async notifyEcho(args: any) {
    this.log.push(`echo:${args.channel}:${args.text}`);
    return { id: "ech1" };
  }
  async archiveEmail(args: any) {
    this.log.push(`archive:${args.emailId}`);
  }
  async tagEmail(args: any) {
    this.log.push(`tag:${args.emailId}:${args.tags.join(",")}`);
  }
  async setEmailPriority(args: any) {
    this.log.push(`prio:${args.emailId}:${args.priority}`);
  }
  async markRuleApplied(args: any) {
    this.log.push(`marked:${args.emailId}:${args.ruleId}`);
  }
}

class StaticSource implements RulesSource {
  constructor(private rules: IrisRule[]) {}
  async loadEnabled() { return this.rules; }
}

// ─── Conditions ─────────────────────────────────────────────────

describe("matchAllConditions", () => {
  it("returns false on empty conditions", () => {
    expect(matchAllConditions(emailFixture(), [])).toBe(false);
  });

  it("contains: case-insensitive by default", () => {
    const e = emailFixture({ raw: { sender: "Andrea.Malvicino@Guazzotti.it", subject: "INCASSI ACG" } as any });
    expect(matchAllConditions(e, [
      { field: "sender", op: "contains", value: "malvicino" },
      { field: "subject", op: "contains", value: "incassi" },
    ])).toBe(true);
  });

  it("equals on category", () => {
    const e = emailFixture({ classification: { category: "GUASTO_URGENTE" } as any });
    expect(matchAllConditions(e, [
      { field: "category", op: "equals", value: "GUASTO_URGENTE" },
    ])).toBe(true);
  });

  it("in op: category is in set", () => {
    const e = emailFixture({ classification: { category: "PEC_UFFICIALE" } as any });
    expect(matchAllConditions(e, [
      { field: "category", op: "in", value: ["PEC_UFFICIALE", "FATTURA_FORNITORE"] },
    ])).toBe(true);
  });

  it("hasAttachments + numeric score gte", () => {
    const e = emailFixture({ raw: { has_attachments: true } as any, score: 65 });
    expect(matchAllConditions(e, [
      { field: "hasAttachments", op: "is_true" },
      { field: "score", op: "gte", value: 60 },
    ])).toBe(true);
  });

  it("regex matches subject", () => {
    const e = emailFixture({ raw: { subject: "Fattura n. 1234/2026" } as any });
    expect(matchAllConditions(e, [
      { field: "subject", op: "matches", value: "fattura\\s*n\\.?\\s*\\d+" },
    ])).toBe(true);
  });

  it("attachmentType in array of types", () => {
    const e = emailFixture({
      attachments: [{ detectedType: "fattura" }, { detectedType: "foto" }],
    });
    expect(matchAllConditions(e, [
      { field: "attachmentType", op: "contains", value: "fattura" },
    ])).toBe(true);
  });
});

// ─── Engine evaluate ─────────────────────────────────────────────

describe("RuleEngine.evaluate", () => {
  it("picks higher-priority rule first", async () => {
    const r1: IrisRule = {
      id: "r1", name: "spam", enabled: true, priority: 10,
      conditions: [{ field: "category", op: "equals", value: "NEWSLETTER_SPAM" }],
      actions: [{ type: "archive_email" }],
    };
    const r2: IrisRule = {
      id: "r2", name: "any", enabled: true, priority: 100,
      conditions: [{ field: "sender", op: "contains", value: "@" }],
      actions: [{ type: "tag_email", tags: ["any"] }],
    };
    const eng = new RuleEngine(new StaticSource([r1, r2]), new FakeRunner());
    await eng.loadRules();
    const e = emailFixture({ classification: { category: "NEWSLETTER_SPAM" } as any });
    const res = eng.evaluate(e);
    expect(res.matchedRule?.id).toBe("r2"); // higher priority wins
  });

  it("returns null match when no rule matches", async () => {
    const r: IrisRule = {
      id: "r", name: "x", enabled: true, priority: 1,
      conditions: [{ field: "category", op: "equals", value: "PEC_UFFICIALE" }],
      actions: [{ type: "archive_email" }],
    };
    const eng = new RuleEngine(new StaticSource([r]), new FakeRunner());
    await eng.loadRules();
    expect(eng.evaluate(emailFixture()).matchedRule).toBeNull();
  });

  it("disabled rules are skipped at load time", async () => {
    const r: IrisRule = {
      id: "r", name: "x", enabled: false, priority: 1,
      conditions: [{ field: "sender", op: "contains", value: "@" }],
      actions: [{ type: "archive_email" }],
    };
    const eng = new RuleEngine(new StaticSource([r]), new FakeRunner());
    await eng.loadRules();
    expect(eng.getRules().length).toBe(0);
  });
});

// ─── Engine execute ──────────────────────────────────────────────

describe("RuleEngine.execute", () => {
  it("runs lavagna + archive + tag and marks applied", async () => {
    const runner = new FakeRunner();
    const rule: IrisRule = {
      id: "r1", name: "incassi", enabled: true, priority: 100,
      conditions: [{ field: "subject", op: "contains", value: "incassi" }],
      actions: [
        { type: "write_lavagna", to: "charta", messageType: "incassi_acg",
          payload: { source: "iris" }, priority: "high" },
        { type: "notify_echo", channel: "wa", text: "incassi nuovi" },
        { type: "archive_email" },
      ],
    };
    const eng = new RuleEngine(new StaticSource([rule]), runner);
    await eng.loadRules();
    const e = emailFixture({ raw: { sender: "x@y.it", subject: "INCASSI di Marzo" } as any });
    const res = eng.evaluate(e);
    expect(res.matchedRule?.id).toBe("r1");
    const out = await eng.execute(e, res.matchedRule!, res.extractedData);
    expect(out.ok).toBe(true);
    expect(runner.log.some(l => l.startsWith("lavagna:charta:incassi_acg"))).toBe(true);
    expect(runner.log).toContain("archive:e1");
    expect(runner.log).toContain("marked:e1:r1");
  });

  it("idempotency: skips re-execution when already applied", async () => {
    const runner = new FakeRunner();
    const rule: IrisRule = {
      id: "rA", name: "x", enabled: true, priority: 1,
      conditions: [{ field: "category", op: "equals", value: "ALTRO" }],
      actions: [{ type: "archive_email" }],
    };
    const eng = new RuleEngine(new StaticSource([rule]), runner);
    await eng.loadRules();
    const e = emailFixture({ appliedRules: ["rA"] });
    const out = await eng.execute(e, rule);
    expect(out.results[0].detail).toBe("already-applied");
    expect(runner.log).toEqual([]); // niente effetti
  });
});

// ─── extractDataFromEmail ───────────────────────────────────────

describe("extractDataFromEmail", () => {
  it("extracts importo regex from subject", () => {
    const e = emailFixture({ raw: { subject: "Incassi €1.250,00 marzo", sender: "x@y.it" } as any });
    const out = extractDataFromEmail(e, [
      { type: "extract_data", extractPatterns: { importo: "€\\s*([0-9.,]+)" } },
    ]);
    expect(out).toEqual({ importo: "1.250,00" });
  });

  it("returns undefined if nothing matches", () => {
    const e = emailFixture();
    const out = extractDataFromEmail(e, [
      { type: "extract_data", extractPatterns: { importo: "€\\s*([0-9.,]+)" } },
    ]);
    expect(out).toBeUndefined();
  });
});
