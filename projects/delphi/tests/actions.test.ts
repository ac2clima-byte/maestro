import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("DELPHI actions (stubs)", () => {
  it("kpiDashboard throws Not implemented", async () => {
    await expect(actions.kpiDashboard()).rejects.toThrow(/Not implemented/);
  });
  it("dashboardHTML throws Not implemented", async () => {
    await expect(actions.dashboardHTML("mattutina")).rejects.toThrow(/Not implemented/);
  });
  it("marginePerIntervento throws Not implemented", async () => {
    await expect(
      actions.marginePerIntervento({ fromDate: "2026-04-01", toDate: "2026-04-30" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("topCondomini throws Not implemented", async () => {
    await expect(actions.topCondomini("2026", "fatturato")).rejects.toThrow(/Not implemented/);
  });
  it("topClienti throws Not implemented", async () => {
    await expect(actions.topClienti("2026", "fatturato")).rejects.toThrow(/Not implemented/);
  });
  it("topTecnici throws Not implemented", async () => {
    await expect(actions.topTecnici("2026", "interventi")).rejects.toThrow(/Not implemented/);
  });
  it("produttivitaTecnico throws Not implemented", async () => {
    await expect(actions.produttivitaTecnico("u1", "2026-04")).rejects.toThrow(/Not implemented/);
  });
  it("produttivitaTeam throws Not implemented", async () => {
    await expect(actions.produttivitaTeam("2026-04")).rejects.toThrow(/Not implemented/);
  });
  it("trend throws Not implemented", async () => {
    await expect(
      actions.trend("interventi", { fromDate: "2026-01-01", toDate: "2026-04-30" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("previsioneIncassi throws Not implemented", async () => {
    await expect(actions.previsioneIncassi(3)).rejects.toThrow(/Not implemented/);
  });
  it("previsioneCaricoLavoro throws Not implemented", async () => {
    await expect(actions.previsioneCaricoLavoro(3)).rejects.toThrow(/Not implemented/);
  });
  it("confrontoAnnoSuAnno throws Not implemented", async () => {
    await expect(actions.confrontoAnnoSuAnno("fatturato", "2026")).rejects.toThrow(/Not implemented/);
  });
  it("anomalie throws Not implemented", async () => {
    await expect(actions.anomalie()).rejects.toThrow(/Not implemented/);
  });
  it("costoAI throws Not implemented", async () => {
    await expect(
      actions.costoAI({ fromDate: "2026-04-01", toDate: "2026-04-30" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("reportMensile throws Not implemented", async () => {
    await expect(actions.reportMensile("2026-04")).rejects.toThrow(/Not implemented/);
  });
  it("reportAnnuale throws Not implemented", async () => {
    await expect(actions.reportAnnuale("2026")).rejects.toThrow(/Not implemented/);
  });
  it("chiedi throws Not implemented", async () => {
    await expect(actions.chiedi("come è andato il trimestre per Cambielli?")).rejects.toThrow(/Not implemented/);
  });
});
