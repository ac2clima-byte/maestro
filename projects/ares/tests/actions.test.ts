import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

/**
 * Placeholder: gli stub devono lanciare "Not implemented".
 * Quando un'azione viene implementata, sostituire il test corrispondente
 * con uno reale (mock Firestore + assertion sull'output).
 */
describe("ARES v0.1 actions (smoke)", () => {
  it("apriIntervento is implemented (function export)", () => {
    expect(typeof actions.apriIntervento).toBe("function");
  });
  it("interventiAperti is implemented (function export)", () => {
    expect(typeof actions.interventiAperti).toBe("function");
  });
});

describe("ARES v0.2 stubs", () => {
  it("assegnaTecnico throws Not implemented", async () => {
    await expect(actions.assegnaTecnico("i1", "u1")).rejects.toThrow(/Not implemented/);
  });
  it("proponiAssegnazioni throws Not implemented", async () => {
    await expect(actions.proponiAssegnazioni("i1")).rejects.toThrow(/Not implemented/);
  });
  it("chiudiIntervento throws Not implemented", async () => {
    await expect(
      actions.chiudiIntervento("i1", { esito: "ok", oreLavorate: 1 }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("generaRTI throws Not implemented", async () => {
    await expect(actions.generaRTI("i1")).rejects.toThrow(/Not implemented/);
  });
  it("notificaTecnico throws Not implemented", async () => {
    await expect(
      actions.notificaTecnico("u1", { titolo: "x", body: "y" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("briefingTecnico throws Not implemented", async () => {
    await expect(actions.briefingTecnico("u1", "2026-04-21")).rejects.toThrow(/Not implemented/);
  });
  it("cercaStoricoInterventi throws Not implemented", async () => {
    await expect(actions.cercaStoricoInterventi("TG12345")).rejects.toThrow(/Not implemented/);
  });
});
