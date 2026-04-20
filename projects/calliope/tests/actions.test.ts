import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("CALLIOPE actions (stubs)", () => {
  it("bozzaRisposta throws Not implemented", async () => {
    await expect(actions.bozzaRisposta("e1", "cordiale")).rejects.toThrow(/Not implemented/);
  });
  it("comunicazioneCondominio throws Not implemented", async () => {
    await expect(actions.comunicazioneCondominio("c1", "accensione impianto")).rejects.toThrow(/Not implemented/);
  });
  it("preventivoFormale throws Not implemented", async () => {
    await expect(actions.preventivoFormale({ lavoro: "manutenzione annuale" })).rejects.toThrow(/Not implemented/);
  });
  it("sollecitoPagamento throws Not implemented", async () => {
    await expect(actions.sollecitoPagamento("f1", "cordiale")).rejects.toThrow(/Not implemented/);
  });
  it("rispostaPEC throws Not implemented", async () => {
    await expect(actions.rispostaPEC("p1")).rejects.toThrow(/Not implemented/);
  });
  it("offertaCommerciale throws Not implemented", async () => {
    await expect(actions.offertaCommerciale("c1", "sostituzione caldaia")).rejects.toThrow(/Not implemented/);
  });
  it("newsletterTecnici throws Not implemented", async () => {
    await expect(actions.newsletterTecnici("2026-04")).rejects.toThrow(/Not implemented/);
  });
  it("comunicazioneMassiva throws Not implemented", async () => {
    await expect(
      actions.comunicazioneMassiva({ argomento: "x", destinatari: [] }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("trascriviAudio throws Not implemented", async () => {
    await expect(actions.trascriviAudio("file:///tmp/x.wav")).rejects.toThrow(/Not implemented/);
  });
  it("verbaleRiunione throws Not implemented", async () => {
    await expect(actions.verbaleRiunione("file:///tmp/x.wav")).rejects.toThrow(/Not implemented/);
  });
  it("revisiona throws Not implemented", async () => {
    await expect(actions.revisiona("b1", "più breve")).rejects.toThrow(/Not implemented/);
  });
  it("approva throws Not implemented", async () => {
    await expect(actions.approva("b1")).rejects.toThrow(/Not implemented/);
  });
  it("rifiuta throws Not implemented", async () => {
    await expect(actions.rifiuta("b1", "tono sbagliato")).rejects.toThrow(/Not implemented/);
  });
  it("listaTemplate throws Not implemented", async () => {
    await expect(actions.listaTemplate()).rejects.toThrow(/Not implemented/);
  });
  it("creaTemplate throws Not implemented", async () => {
    await expect(
      actions.creaTemplate({ nome: "t1", tipo: "preventivo", corpo: "..." }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("generaDaTemplate throws Not implemented", async () => {
    await expect(actions.generaDaTemplate("t1", {})).rejects.toThrow(/Not implemented/);
  });
  it("imparaStile throws Not implemented", async () => {
    await expect(actions.imparaStile([{ corpo: "esempio" }])).rejects.toThrow(/Not implemented/);
  });
});
