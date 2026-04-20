import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("DIKEA actions (stubs)", () => {
  it("scadenzeCURIT throws Not implemented", async () => {
    await expect(actions.scadenzeCURIT()).rejects.toThrow(/Not implemented/);
  });
  it("verificaStatoCURIT throws Not implemented", async () => {
    await expect(actions.verificaStatoCURIT("TG1")).rejects.toThrow(/Not implemented/);
  });
  it("impiantiSenzaTarga throws Not implemented", async () => {
    await expect(actions.impiantiSenzaTarga()).rejects.toThrow(/Not implemented/);
  });
  it("impiantiNonRegistrati throws Not implemented", async () => {
    await expect(actions.impiantiNonRegistrati()).rejects.toThrow(/Not implemented/);
  });
  it("generaDiCo throws Not implemented", async () => {
    await expect(actions.generaDiCo({ interventoId: "i1" })).rejects.toThrow(/Not implemented/);
  });
  it("validaDiCo throws Not implemented", async () => {
    await expect(actions.validaDiCo({ dicoId: "d1" })).rejects.toThrow(/Not implemented/);
  });
  it("inviaDiCo throws Not implemented", async () => {
    await expect(actions.inviaDiCo("d1")).rejects.toThrow(/Not implemented/);
  });
  it("dicoMancanti throws Not implemented", async () => {
    await expect(actions.dicoMancanti()).rejects.toThrow(/Not implemented/);
  });
  it("checkFGas throws Not implemented", async () => {
    await expect(actions.checkFGas("imp1")).rejects.toThrow(/Not implemented/);
  });
  it("scadenzeFGas throws Not implemented", async () => {
    await expect(actions.scadenzeFGas()).rejects.toThrow(/Not implemented/);
  });
  it("gestisciPEC throws Not implemented", async () => {
    await expect(actions.gestisciPEC("e1")).rejects.toThrow(/Not implemented/);
  });
  it("bozzaRispostaPEC throws Not implemented", async () => {
    await expect(actions.bozzaRispostaPEC("p1")).rejects.toThrow(/Not implemented/);
  });
  it("pecInScadenza throws Not implemented", async () => {
    await expect(actions.pecInScadenza()).rejects.toThrow(/Not implemented/);
  });
  it("auditAccessi throws Not implemented", async () => {
    await expect(actions.auditAccessi()).rejects.toThrow(/Not implemented/);
  });
  it("verificaConformitaGDPR throws Not implemented", async () => {
    await expect(actions.verificaConformitaGDPR()).rejects.toThrow(/Not implemented/);
  });
  it("reportConformita throws Not implemented", async () => {
    await expect(actions.reportConformita("2026-04")).rejects.toThrow(/Not implemented/);
  });
});
