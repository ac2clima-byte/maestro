import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("PHARO actions (stubs)", () => {
  it("controlloHeartbeat throws Not implemented", async () => {
    await expect(actions.controlloHeartbeat()).rejects.toThrow(/Not implemented/);
  });
  it("statoSuite throws Not implemented", async () => {
    await expect(actions.statoSuite()).rejects.toThrow(/Not implemented/);
  });
  it("reportSalute throws Not implemented", async () => {
    await expect(actions.reportSalute()).rejects.toThrow(/Not implemented/);
  });
  it("budgetAnthropic throws Not implemented", async () => {
    await expect(actions.budgetAnthropic("2026-04")).rejects.toThrow(/Not implemented/);
  });
  it("costiInfrastruttura throws Not implemented", async () => {
    await expect(
      actions.costiInfrastruttura({ fromDate: "2026-04-01", toDate: "2026-04-30" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("impiantiOrfani throws Not implemented", async () => {
    await expect(actions.impiantiOrfani()).rejects.toThrow(/Not implemented/);
  });
  it("emailSenzaRisposta throws Not implemented", async () => {
    await expect(actions.emailSenzaRisposta()).rejects.toThrow(/Not implemented/);
  });
  it("interventiBloccati throws Not implemented", async () => {
    await expect(actions.interventiBloccati()).rejects.toThrow(/Not implemented/);
  });
  it("fattureNonInviate throws Not implemented", async () => {
    await expect(actions.fattureNonInviate()).rejects.toThrow(/Not implemented/);
  });
  it("clientiSilenziosi throws Not implemented", async () => {
    await expect(actions.clientiSilenziosi()).rejects.toThrow(/Not implemented/);
  });
  it("duplicatiDatabase throws Not implemented", async () => {
    await expect(actions.duplicatiDatabase()).rejects.toThrow(/Not implemented/);
  });
  it("alertAttivi throws Not implemented", async () => {
    await expect(actions.alertAttivi()).rejects.toThrow(/Not implemented/);
  });
  it("acknowledgeAlert throws Not implemented", async () => {
    await expect(actions.acknowledgeAlert("a1")).rejects.toThrow(/Not implemented/);
  });
  it("risolviAlert throws Not implemented", async () => {
    await expect(actions.risolviAlert("a1")).rejects.toThrow(/Not implemented/);
  });
  it("silenziaAlert throws Not implemented", async () => {
    await expect(actions.silenziaAlert("a1", "2026-04-30T00:00:00Z")).rejects.toThrow(/Not implemented/);
  });
  it("listaRegole throws Not implemented", async () => {
    await expect(actions.listaRegole()).rejects.toThrow(/Not implemented/);
  });
  it("creaRegola throws Not implemented", async () => {
    await expect(
      actions.creaRegola({ nome: "x", tipo: "heartbeat", intervalSec: 300 }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("eseguiControlliPeriodici throws Not implemented", async () => {
    await expect(actions.eseguiControlliPeriodici()).rejects.toThrow(/Not implemented/);
  });
});
