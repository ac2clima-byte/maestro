import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";

import type { Email } from "../types/email.js";
import type {
  EmailClassification,
  ClassificationType,
  SuggestedAction,
  ConfidenceLevel,
  ExtractedEntities,
  SentimentLevel,
} from "../types/classification.js";
import {
  CLASSIFICATION_TYPES,
  SUGGESTED_ACTIONS,
  SENTIMENT_LEVELS,
} from "../types/classification.js";

export const DEFAULT_MODEL = "claude-haiku-4-5";
export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_TIMEOUT_MS = 30_000;

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicMessageResponse {
  content: Array<AnthropicTextBlock | { type: string; [k: string]: unknown }>;
}

export interface AnthropicLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<AnthropicMessageResponse>;
  };
}

export interface ClassifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  systemPromptPath?: string;
  client?: AnthropicLike;
}

export class ClassifierConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassifierConfigError";
  }
}

export class ClassifierParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "ClassifierParseError";
  }
}

function defaultPromptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "prompts", "classifier.md");
}

export class Classifier {
  private readonly client: AnthropicLike;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly systemPromptPath: string;
  private systemPromptCache: string | null = null;

  constructor(options: ClassifierOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!options.client && !apiKey) {
      throw new ClassifierConfigError(
        "ANTHROPIC_API_KEY is required (set env var or pass apiKey).",
      );
    }

    this.client =
      options.client ??
      (new Anthropic({
        apiKey: apiKey!,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      }) as unknown as AnthropicLike);
    this.model = options.model ?? process.env.IRIS_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.systemPromptPath = options.systemPromptPath ?? defaultPromptPath();
  }

  async classify(email: Email): Promise<EmailClassification> {
    const systemPrompt = await this.loadSystemPrompt();
    const userPrompt = buildUserPrompt(email);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = extractText(response);
    return parseClassification(text);
  }

  private async loadSystemPrompt(): Promise<string> {
    if (this.systemPromptCache) return this.systemPromptCache;
    const content = await readFile(this.systemPromptPath, "utf8");
    this.systemPromptCache = content;
    return content;
  }
}

export function buildUserPrompt(email: Email): string {
  const received = email.received_time ?? "(data non disponibile)";
  const flags: string[] = [];
  if (email.has_attachments) flags.push("con allegati");
  if (email.importance && email.importance !== "Normal") {
    flags.push(`importanza: ${email.importance}`);
  }
  const flagsLine = flags.length ? `Flag: ${flags.join(", ")}\n` : "";

  return [
    `Classifica la seguente email.`,
    ``,
    `Mittente: ${email.sender || "(sconosciuto)"}`,
    `Ricevuta: ${received}`,
    `Oggetto: ${email.subject || "(nessun oggetto)"}`,
    flagsLine,
    `--- CORPO EMAIL ---`,
    email.body_text || "(corpo vuoto)",
    `--- FINE CORPO ---`,
    ``,
    `Rispondi ESCLUSIVAMENTE con l'oggetto JSON previsto dallo schema.`,
  ].join("\n");
}

function extractText(response: AnthropicMessageResponse): string {
  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text" && typeof (block as AnthropicTextBlock).text === "string") {
      parts.push((block as AnthropicTextBlock).text);
    }
  }
  return parts.join("\n").trim();
}

export function parseClassification(raw: string): EmailClassification {
  const json = extractJsonObject(raw);
  if (!json) {
    throw new ClassifierParseError(
      "No JSON object found in model response.",
      raw,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new ClassifierParseError(
      `Invalid JSON from model: ${(err as Error).message}`,
      raw,
    );
  }

  return validateClassification(parsed, raw);
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function validateClassification(
  value: unknown,
  raw: string,
): EmailClassification {
  if (!value || typeof value !== "object") {
    throw new ClassifierParseError("Response is not a JSON object.", raw);
  }
  const obj = value as Record<string, unknown>;

  const category = obj.category;
  if (
    typeof category !== "string" ||
    !CLASSIFICATION_TYPES.includes(category as ClassificationType)
  ) {
    throw new ClassifierParseError(
      `Invalid category: ${String(category)}`,
      raw,
    );
  }

  const suggestedAction = obj.suggestedAction;
  if (
    typeof suggestedAction !== "string" ||
    !SUGGESTED_ACTIONS.includes(suggestedAction as SuggestedAction)
  ) {
    throw new ClassifierParseError(
      `Invalid suggestedAction: ${String(suggestedAction)}`,
      raw,
    );
  }

  const confidence = obj.confidence;
  if (
    confidence !== "high" &&
    confidence !== "medium" &&
    confidence !== "low"
  ) {
    throw new ClassifierParseError(
      `Invalid confidence: ${String(confidence)}`,
      raw,
    );
  }

  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
  const entities = normalizeEntities(obj.entities);

  // Sentiment: default to "neutro" when missing or invalid — additive field.
  const rawSentiment = obj.sentiment;
  const sentiment: SentimentLevel =
    typeof rawSentiment === "string" &&
    (SENTIMENT_LEVELS as readonly string[]).includes(rawSentiment)
      ? (rawSentiment as SentimentLevel)
      : "neutro";
  const sentimentReason =
    typeof obj.sentimentReason === "string" ? obj.sentimentReason : "";

  return {
    category: category as ClassificationType,
    summary,
    entities,
    suggestedAction: suggestedAction as SuggestedAction,
    confidence: confidence as ConfidenceLevel,
    reasoning,
    sentiment,
    sentimentReason,
  };
}

function normalizeEntities(value: unknown): ExtractedEntities {
  if (!value || typeof value !== "object") return {};
  const src = value as Record<string, unknown>;
  const out: ExtractedEntities = {};
  const keys: (keyof ExtractedEntities)[] = [
    "cliente",
    "condominio",
    "impianto",
    "urgenza",
    "importo",
    "tecnico",
    "indirizzo",
  ];
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) {
      out[k] = v.trim();
    }
  }
  return out;
}
