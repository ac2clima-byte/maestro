import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("CHARTA actions (stubs)", () => {
  it("registraFattura throws Not implemented", async () => {
    await expect(
      actions.registraFattura({
        tipo: "ricevuta", numero: "F1", controparteId: "c1",
        dataEmissione: "2026-04-20", imponibile: 100, iva: 22, totale: 122,
      }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("parseFatturaFornitore throws Not implemented", async () => {
    await expect(actions.parseFatturaFornitore({ filename: "x.pdf" })).rejects.toThrow(/Not implemented/);
  });
  it("scadenzeFatture throws Not implemented", async () => {
    await expect(actions.scadenzeFatture()).rejects.toThrow(/Not implemented/);
  });
  it("fattureScadute throws Not implemented", async () => {
    await expect(actions.fattureScadute()).rejects.toThrow(/Not implemented/);
  });
  it("registraIncasso throws Not implemented", async () => {
    await expect(
      actions.registraIncasso({
        direzione: "in", controparteId: "c1", importo: 100,
        data: "2026-04-20", metodo: "bonifico",
      }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("estraiIncassiDaEmail throws Not implemented", async () => {
    await expect(actions.estraiIncassiDaEmail("e1")).rejects.toThrow(/Not implemented/);
  });
  it("estraiIncassiDaExcel throws Not implemented", async () => {
    await expect(actions.estraiIncassiDaExcel({ filePath: "/tmp/x.xlsx" })).rejects.toThrow(/Not implemented/);
  });
  it("registraDDT throws Not implemented", async () => {
    await expect(
      actions.registraDDT({
        numero: "D1", data: "2026-04-20", controparteId: "f1",
        direzione: "in", righe: [],
      }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("parseDDT throws Not implemented", async () => {
    await expect(actions.parseDDT({ filename: "ddt.pdf" })).rejects.toThrow(/Not implemented/);
  });
  it("controllaDDTvsFattura throws Not implemented", async () => {
    await expect(actions.controllaDDTvsFattura("d1")).rejects.toThrow(/Not implemented/);
  });
  it("ddtSenzaFattura throws Not implemented", async () => {
    await expect(actions.ddtSenzaFattura()).rejects.toThrow(/Not implemented/);
  });
  it("esposizioneCliente throws Not implemented", async () => {
    await expect(actions.esposizioneCliente("c1")).rejects.toThrow(/Not implemented/);
  });
  it("clientiAltaEsposizione throws Not implemented", async () => {
    await expect(actions.clientiAltaEsposizione()).rejects.toThrow(/Not implemented/);
  });
  it("reportMensile throws Not implemented", async () => {
    await expect(actions.reportMensile("2026-04")).rejects.toThrow(/Not implemented/);
  });
  it("reportAnnuale throws Not implemented", async () => {
    await expect(actions.reportAnnuale("2026")).rejects.toThrow(/Not implemented/);
  });
  it("generaSollecito throws Not implemented", async () => {
    await expect(actions.generaSollecito("f1", "cordiale")).rejects.toThrow(/Not implemented/);
  });
  it("sollecitiBatch throws Not implemented", async () => {
    await expect(actions.sollecitiBatch()).rejects.toThrow(/Not implemented/);
  });
  it("riconciliaAutomatica throws Not implemented", async () => {
    await expect(actions.riconciliaAutomatica()).rejects.toThrow(/Not implemented/);
  });
});
