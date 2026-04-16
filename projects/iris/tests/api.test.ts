import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { createIrisRouter, createMockStore } from "../src/api/routes.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", createIrisRouter({ store: createMockStore() }));
  return app;
}

describe("IRIS API routes", () => {
  describe("GET /api/emails", () => {
    it("returns all emails for the default user", async () => {
      const app = makeApp();
      const res = await request(app).get("/api/emails");

      expect(res.status).toBe(200);
      expect(res.body.emails).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.nextPageToken).toBeNull();
    });

    it("filters by category", async () => {
      const app = makeApp();
      const res = await request(app)
        .get("/api/emails")
        .query({ category: "GUASTO_URGENTE" });

      expect(res.status).toBe(200);
      expect(res.body.emails).toHaveLength(1);
      expect(res.body.emails[0].classification.category).toBe("GUASTO_URGENTE");
    });

    it("rejects an unknown category", async () => {
      const app = makeApp();
      const res = await request(app)
        .get("/api/emails")
        .query({ category: "NOPE" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_category");
    });

    it("respects pageSize", async () => {
      const app = makeApp();
      const res = await request(app)
        .get("/api/emails")
        .query({ pageSize: 1 });

      expect(res.status).toBe(200);
      expect(res.body.emails).toHaveLength(1);
    });

    it("returns empty list for an unknown user", async () => {
      const app = makeApp();
      const res = await request(app)
        .get("/api/emails")
        .query({ userId: "nobody" });

      expect(res.status).toBe(200);
      expect(res.body.emails).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });

  describe("GET /api/emails/:id", () => {
    it("returns a single email", async () => {
      const app = makeApp();
      const res = await request(app).get("/api/emails/%3Cm1@corp.local%3E");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("<m1@corp.local>");
      expect(res.body.classification.category).toBe("RICHIESTA_INTERVENTO");
    });

    it("returns 404 for unknown id", async () => {
      const app = makeApp();
      const res = await request(app).get("/api/emails/does-not-exist");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found");
    });
  });

  describe("POST /api/emails/:id/correct", () => {
    it("applies a correction", async () => {
      const app = makeApp();
      const res = await request(app)
        .post("/api/emails/%3Cm1@corp.local%3E/correct")
        .send({
          category: "PREVENTIVO",
          suggestedAction: "PREPARA_PREVENTIVO",
          notes: "In realtà sta chiedendo un preventivo.",
        });

      expect(res.status).toBe(200);
      expect(res.body.email.status).toBe("corrected");
      expect(res.body.email.correction.category).toBe("PREVENTIVO");
      expect(res.body.correction.originalCategory).toBe("RICHIESTA_INTERVENTO");
      expect(res.body.correction.correctedCategory).toBe("PREVENTIVO");
      expect(res.body.correction.notes).toContain("preventivo");
    });

    it("rejects a correction with missing category", async () => {
      const app = makeApp();
      const res = await request(app)
        .post("/api/emails/%3Cm1@corp.local%3E/correct")
        .send({ suggestedAction: "ARCHIVIA" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_category");
    });

    it("rejects a correction with invalid action", async () => {
      const app = makeApp();
      const res = await request(app)
        .post("/api/emails/%3Cm1@corp.local%3E/correct")
        .send({ category: "PREVENTIVO", suggestedAction: "NOT_AN_ACTION" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("invalid_action");
    });

    it("returns 404 for unknown email id", async () => {
      const app = makeApp();
      const res = await request(app)
        .post("/api/emails/nope/correct")
        .send({ category: "PREVENTIVO", suggestedAction: "PREPARA_PREVENTIVO" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("not_found");
    });
  });

  describe("GET /api/stats", () => {
    it("returns aggregate statistics", async () => {
      const app = makeApp();
      const res = await request(app).get("/api/stats");

      expect(res.status).toBe(200);
      expect(res.body.totalEmails).toBe(2);
      expect(res.body.byCategory.RICHIESTA_INTERVENTO).toBe(1);
      expect(res.body.byCategory.GUASTO_URGENTE).toBe(1);
      expect(res.body.correctionRate).toBe(0);
      expect(res.body.averageConfidence).toBeCloseTo(1, 5);
    });

    it("returns zeros for an unknown user", async () => {
      const app = makeApp();
      const res = await request(app)
        .get("/api/stats")
        .query({ userId: "nobody" });

      expect(res.status).toBe(200);
      expect(res.body.totalEmails).toBe(0);
      expect(res.body.correctionRate).toBe(0);
      expect(res.body.averageConfidence).toBe(0);
    });
  });
});
