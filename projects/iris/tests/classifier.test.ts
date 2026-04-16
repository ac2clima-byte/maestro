import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  Classifier,
  ClassifierConfigError,
  ClassifierParseError,
  type AnthropicLike,
} from "../src/classifier/Classifier.js";
import type { Email } from "../src/types/email.js";
import type { EmailClassification } from "../src/types/classification.js";

const here = dirname(fileURLToPath(import.meta.url));
const promptPath = resolve(here, "..", "prompts", "classifier.md");

function makeClient(response: unknown): { client: AnthropicLike; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(response) }],
  });
  const client: AnthropicLike = {
    messages: { create },
  };
  return { client, create };
}

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    message_id: "<m1@corp.local>",
    subject: "",
    sender: "",
    received_time: "2026-04-16T18:00:00+00:00",
    body_text: "",
    has_attachments: false,
    importance: "Normal",
    ...overrides,
  };
}

describe("Classifier.classify", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("classifies a service request email", async () => {
    const expected: EmailClassification = {
      category: "RICHIESTA_INTERVENTO",
      summary: "Il cliente richiede la manutenzione annuale della caldaia.",
      entities: {
        cliente: "Sig. Rossi",
        impianto: "Vaillant ecoTEC plus",
        urgenza: "bassa",
        indirizzo: "Via Marsala 12, Alessandria",
      },
      suggestedAction: "APRI_INTERVENTO",
      confidence: "high",
      reasoning: "Richiesta esplicita di manutenzione ordinaria.",
    };
    const { client, create } = makeClient(expected);

    const classifier = new Classifier({
      client,
      systemPromptPath: promptPath,
    });
    const result = await classifier.classify(
      makeEmail({
        subject: "Manutenzione caldaia",
        sender: "mario.rossi@example.com",
        body_text:
          "Buongiorno, vorrei prenotare la manutenzione annuale della mia Vaillant ecoTEC plus. Abito in Via Marsala 12 ad Alessandria. Grazie, Mario Rossi",
      }),
    );

    expect(result).toEqual(expected);
    expect(create).toHaveBeenCalledOnce();
    const callArgs = create.mock.calls[0][0];
    expect(callArgs.model).toBe("claude-haiku-4-5");
    expect(callArgs.system).toContain("IRIS");
    expect(callArgs.messages[0].content).toContain("Via Marsala 12");
  });

  it("classifies a supplier invoice email", async () => {
    const expected: EmailClassification = {
      category: "FATTURA_FORNITORE",
      summary: "Fattura Vaillant 4521/2026, importo 1.250,00 EUR, scadenza 30gg.",
      entities: {
        cliente: "Vaillant Group Italia SpA",
        importo: "1250,00",
      },
      suggestedAction: "VERIFICA_PAGAMENTO",
      confidence: "high",
      reasoning: "Email da fornitore noto con fattura allegata.",
    };
    const { client } = makeClient(expected);

    const classifier = new Classifier({
      client,
      systemPromptPath: promptPath,
    });
    const result = await classifier.classify(
      makeEmail({
        subject: "Fattura n. 4521/2026",
        sender: "amministrazione@vaillant.it",
        body_text:
          "In allegato fattura n. 4521 del 15/04/2026, importo 1.250,00 EUR, scadenza 30 giorni.",
        has_attachments: true,
      }),
    );

    expect(result.category).toBe("FATTURA_FORNITORE");
    expect(result.suggestedAction).toBe("VERIFICA_PAGAMENTO");
    expect(result.entities.importo).toBe("1250,00");
  });

  it("classifies an urgent breakdown email", async () => {
    const expected: EmailClassification = {
      category: "GUASTO_URGENTE",
      summary: "Caldaia condominiale in blocco, nessun riscaldamento.",
      entities: {
        condominio: "Condominio Via Dante 5, Voghera",
        urgenza: "critica",
      },
      suggestedAction: "URGENTE_CHIAMA",
      confidence: "high",
      reasoning: "Blocco caldaia condominiale richiede intervento immediato.",
    };
    const { client } = makeClient(expected);

    const classifier = new Classifier({
      client,
      systemPromptPath: promptPath,
    });
    const result = await classifier.classify(
      makeEmail({
        subject: "URGENTE caldaia in blocco",
        sender: "admin@studioalfa.it",
        body_text:
          "Buongiorno, la caldaia del Condominio Via Dante 5 a Voghera è in blocco da stamattina. I condòmini sono senza riscaldamento. Per favore intervenite subito.",
        importance: "High",
      }),
    );

    expect(result.category).toBe("GUASTO_URGENTE");
    expect(result.suggestedAction).toBe("URGENTE_CHIAMA");
    expect(result.entities.urgenza).toBe("critica");
  });

  it("throws ClassifierConfigError when API key is missing and no client injected", () => {
    expect(() => new Classifier({ systemPromptPath: promptPath })).toThrow(
      ClassifierConfigError,
    );
  });

  it("does not throw when API key is in env", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(
      () => new Classifier({ systemPromptPath: promptPath }),
    ).not.toThrow();
  });

  it("throws ClassifierParseError on malformed JSON from the API", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Ecco la classificazione: { category: RICHIESTA_INTERVENTO, broken",
        },
      ],
    });
    const client: AnthropicLike = { messages: { create } };

    const classifier = new Classifier({
      client,
      systemPromptPath: promptPath,
    });

    await expect(classifier.classify(makeEmail())).rejects.toBeInstanceOf(
      ClassifierParseError,
    );
  });

  it("throws ClassifierParseError when category is invalid", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            category: "NOT_A_REAL_CATEGORY",
            summary: "x",
            entities: {},
            suggestedAction: "ARCHIVIA",
            confidence: "low",
            reasoning: "x",
          }),
        },
      ],
    });
    const client: AnthropicLike = { messages: { create } };

    const classifier = new Classifier({
      client,
      systemPromptPath: promptPath,
    });

    await expect(classifier.classify(makeEmail())).rejects.toThrow(
      /Invalid category/,
    );
  });

  it("tolerates fenced ```json blocks in the response", async () => {
    const payload: EmailClassification = {
      category: "NEWSLETTER_SPAM",
      summary: "Newsletter promozionale.",
      entities: {},
      suggestedAction: "ARCHIVIA",
      confidence: "high",
      reasoning: "Mittente noto di newsletter.",
    };
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: "Ecco l'output:\n```json\n" + JSON.stringify(payload) + "\n```",
        },
      ],
    });
    const client: AnthropicLike = { messages: { create } };

    const classifier = new Classifier({
      client,
      systemPromptPath: promptPath,
    });
    const result = await classifier.classify(makeEmail());

    expect(result).toEqual(payload);
  });
});
