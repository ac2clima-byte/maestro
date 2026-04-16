import { Router, type Request, type Response } from "express";

import type {
  ClassificationType,
  SuggestedAction,
} from "../types/classification.js";
import {
  CLASSIFICATION_TYPES,
  SUGGESTED_ACTIONS,
} from "../types/classification.js";
import type {
  IrisEmailDoc,
  IrisCorrectionDoc,
  FirestoreTimestamp,
} from "../types/firestore.js";

export const DEFAULT_USER_ID = "alberto";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ListEmailsQuery {
  userId?: string;
  category?: ClassificationType;
  pageSize?: number;
  pageToken?: string;
}

export interface ListEmailsResponse {
  emails: IrisEmailDoc[];
  nextPageToken: string | null;
  total: number;
}

export interface CorrectionRequest {
  category: ClassificationType;
  suggestedAction: SuggestedAction;
  notes?: string;
}

export interface CorrectionResponse {
  email: IrisEmailDoc;
  correction: IrisCorrectionDoc;
}

export interface StatsResponse {
  totalEmails: number;
  byCategory: Record<string, number>;
  correctionRate: number;
  averageConfidence: number;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface IrisStore {
  listEmails(query: Required<Pick<ListEmailsQuery, "userId" | "pageSize">> & {
    category?: ClassificationType;
    pageToken?: string;
  }): Promise<ListEmailsResponse>;
  getEmail(userId: string, id: string): Promise<IrisEmailDoc | null>;
  correctEmail(
    userId: string,
    id: string,
    correction: CorrectionRequest,
  ): Promise<CorrectionResponse | null>;
  stats(userId: string): Promise<StatsResponse>;
}

export interface RouterOptions {
  store?: IrisStore;
  defaultUserId?: string;
}

export function createIrisRouter(options: RouterOptions = {}): Router {
  const store = options.store ?? createMockStore();
  const defaultUserId = options.defaultUserId ?? DEFAULT_USER_ID;
  const router = Router();

  router.get("/emails", async (req: Request, res: Response) => {
    const userId =
      typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : defaultUserId;

    const rawCategory = req.query.category;
    let category: ClassificationType | undefined;
    if (typeof rawCategory === "string" && rawCategory.length > 0) {
      if (!CLASSIFICATION_TYPES.includes(rawCategory as ClassificationType)) {
        return sendError(res, 400, "invalid_category", `Unknown category: ${rawCategory}`);
      }
      category = rawCategory as ClassificationType;
    }

    const pageSize = clampPageSize(req.query.pageSize);
    const pageToken =
      typeof req.query.pageToken === "string" && req.query.pageToken.length > 0
        ? req.query.pageToken
        : undefined;

    try {
      const result = await store.listEmails({
        userId,
        pageSize,
        category,
        pageToken,
      });
      res.json(result);
    } catch (err) {
      sendError(res, 500, "list_failed", (err as Error).message);
    }
  });

  router.get("/emails/:id", async (req: Request, res: Response) => {
    const userId =
      typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : defaultUserId;
    try {
      const email = await store.getEmail(userId, req.params.id);
      if (!email) {
        return sendError(res, 404, "not_found", `Email ${req.params.id} not found`);
      }
      res.json(email);
    } catch (err) {
      sendError(res, 500, "get_failed", (err as Error).message);
    }
  });

  router.post("/emails/:id/correct", async (req: Request, res: Response) => {
    const userId =
      typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : defaultUserId;
    const body = req.body as Partial<CorrectionRequest> | undefined;
    if (!body) {
      return sendError(res, 400, "invalid_body", "Request body is required");
    }
    if (
      typeof body.category !== "string" ||
      !CLASSIFICATION_TYPES.includes(body.category as ClassificationType)
    ) {
      return sendError(
        res,
        400,
        "invalid_category",
        `category must be one of: ${CLASSIFICATION_TYPES.join(", ")}`,
      );
    }
    if (
      typeof body.suggestedAction !== "string" ||
      !SUGGESTED_ACTIONS.includes(body.suggestedAction as SuggestedAction)
    ) {
      return sendError(
        res,
        400,
        "invalid_action",
        `suggestedAction must be one of: ${SUGGESTED_ACTIONS.join(", ")}`,
      );
    }

    const correction: CorrectionRequest = {
      category: body.category as ClassificationType,
      suggestedAction: body.suggestedAction as SuggestedAction,
      notes: typeof body.notes === "string" ? body.notes : "",
    };

    try {
      const result = await store.correctEmail(userId, req.params.id, correction);
      if (!result) {
        return sendError(res, 404, "not_found", `Email ${req.params.id} not found`);
      }
      res.status(200).json(result);
    } catch (err) {
      sendError(res, 500, "correct_failed", (err as Error).message);
    }
  });

  router.get("/stats", async (req: Request, res: Response) => {
    const userId =
      typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : defaultUserId;
    try {
      const stats = await store.stats(userId);
      res.json(stats);
    } catch (err) {
      sendError(res, 500, "stats_failed", (err as Error).message);
    }
  });

  return router;
}

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiError = { error: code, message };
  res.status(status).json(body);
}

function clampPageSize(raw: unknown): number {
  if (typeof raw !== "string" && typeof raw !== "number") return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(n)), MAX_PAGE_SIZE);
}

function now(): FirestoreTimestamp {
  const ms = Date.now();
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  };
}

export function createMockStore(): IrisStore {
  const mockEmails: IrisEmailDoc[] = [
    {
      id: "<m1@corp.local>",
      userId: DEFAULT_USER_ID,
      raw: {
        subject: "Manutenzione caldaia",
        sender: "mario.rossi@example.com",
        body_text: "Buongiorno, vorrei prenotare la manutenzione annuale.",
        received_time: "2026-04-16T18:00:00+00:00",
        has_attachments: false,
        importance: "Normal",
      },
      classification: {
        category: "RICHIESTA_INTERVENTO",
        summary: "Cliente richiede manutenzione annuale caldaia.",
        entities: { cliente: "Mario Rossi", urgenza: "bassa" },
        suggestedAction: "APRI_INTERVENTO",
        confidence: "high",
        reasoning: "Richiesta esplicita di manutenzione ordinaria.",
      },
      status: "classified",
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "<m2@corp.local>",
      userId: DEFAULT_USER_ID,
      raw: {
        subject: "URGENTE caldaia in blocco",
        sender: "admin@studioalfa.it",
        body_text: "Caldaia condominiale in blocco.",
        received_time: "2026-04-16T18:30:00+00:00",
        has_attachments: false,
        importance: "High",
      },
      classification: {
        category: "GUASTO_URGENTE",
        summary: "Caldaia condominiale in blocco, senza riscaldamento.",
        entities: {
          condominio: "Condominio Via Dante 5",
          urgenza: "critica",
        },
        suggestedAction: "URGENTE_CHIAMA",
        confidence: "high",
        reasoning: "Segnalazione di blocco caldaia condominiale.",
      },
      status: "classified",
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  return {
    async listEmails({ userId, pageSize, category }) {
      let filtered = mockEmails.filter((e) => e.userId === userId);
      if (category) {
        filtered = filtered.filter((e) => e.classification.category === category);
      }
      return {
        emails: filtered.slice(0, pageSize),
        nextPageToken: null,
        total: filtered.length,
      };
    },
    async getEmail(userId, id) {
      return mockEmails.find((e) => e.userId === userId && e.id === id) ?? null;
    },
    async correctEmail(userId, id, correction) {
      const email = mockEmails.find((e) => e.userId === userId && e.id === id);
      if (!email) return null;
      const correctionDoc: IrisCorrectionDoc = {
        id: `corr-${Date.now()}`,
        userId,
        emailId: id,
        originalCategory: email.classification.category,
        correctedCategory: correction.category,
        originalAction: email.classification.suggestedAction,
        correctedAction: correction.suggestedAction,
        notes: correction.notes ?? "",
        createdAt: now(),
      };
      const updated: IrisEmailDoc = {
        ...email,
        status: "corrected",
        correction: {
          category: correction.category,
          suggestedAction: correction.suggestedAction,
          notes: correction.notes ?? "",
          correctedAt: now(),
        },
        updatedAt: now(),
      };
      return { email: updated, correction: correctionDoc };
    },
    async stats(userId) {
      const mine = mockEmails.filter((e) => e.userId === userId);
      const byCategory: Record<string, number> = {};
      let correctedCount = 0;
      const confidenceScore = { high: 1, medium: 0.66, low: 0.33 };
      let confidenceSum = 0;
      for (const e of mine) {
        byCategory[e.classification.category] =
          (byCategory[e.classification.category] ?? 0) + 1;
        if (e.status === "corrected") correctedCount += 1;
        confidenceSum += confidenceScore[e.classification.confidence];
      }
      return {
        totalEmails: mine.length,
        byCategory,
        correctionRate: mine.length ? correctedCount / mine.length : 0,
        averageConfidence: mine.length ? confidenceSum / mine.length : 0,
      };
    },
  };
}
