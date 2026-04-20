import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("EMPORION actions (stubs)", () => {
  it("disponibilita throws Not implemented", async () => {
    await expect(actions.disponibilita({ codice: "X" })).rejects.toThrow(/Not implemented/);
  });
  it("dovSiTrova throws Not implemented", async () => {
    await expect(actions.dovSiTrova("a1")).rejects.toThrow(/Not implemented/);
  });
  it("articoliSottoScorta throws Not implemented", async () => {
    await expect(actions.articoliSottoScorta()).rejects.toThrow(/Not implemented/);
  });
  it("carico throws Not implemented", async () => {
    await expect(
      actions.carico({ articoloId: "a1", quantita: 5, causale: "ddt", destinazione: "centrale" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("scarico throws Not implemented", async () => {
    await expect(
      actions.scarico({ articoloId: "a1", quantita: 1, causale: "intervento", sorgente: "furgone_marco" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("trasferisci throws Not implemented", async () => {
    await expect(actions.trasferisci("a1", "centrale", "furgone_marco", 2)).rejects.toThrow(/Not implemented/);
  });
  it("creaOrdine throws Not implemented", async () => {
    await expect(
      actions.creaOrdine({ fornitoreId: "f1", righe: [] }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("ordiniInCorso throws Not implemented", async () => {
    await expect(actions.ordiniInCorso()).rejects.toThrow(/Not implemented/);
  });
  it("ricevutoOrdine throws Not implemented", async () => {
    await expect(actions.ricevutoOrdine("o1")).rejects.toThrow(/Not implemented/);
  });
  it("suggerisciRiordino throws Not implemented", async () => {
    await expect(actions.suggerisciRiordino()).rejects.toThrow(/Not implemented/);
  });
  it("listiniComparati throws Not implemented", async () => {
    await expect(actions.listiniComparati({ codice: "X" })).rejects.toThrow(/Not implemented/);
  });
  it("ocrDDT throws Not implemented", async () => {
    await expect(actions.ocrDDT({ filename: "ddt.pdf" })).rejects.toThrow(/Not implemented/);
  });
  it("caricaDaDDT throws Not implemented", async () => {
    await expect(actions.caricaDaDDT("d1")).rejects.toThrow(/Not implemented/);
  });
  it("inventarioFurgone throws Not implemented", async () => {
    await expect(actions.inventarioFurgone("u1")).rejects.toThrow(/Not implemented/);
  });
  it("rifornisciFurgone throws Not implemented", async () => {
    await expect(actions.rifornisciFurgone("u1", [{ articoloId: "a1", quantita: 1 }])).rejects.toThrow(/Not implemented/);
  });
  it("articoliCompatibili throws Not implemented", async () => {
    await expect(actions.articoliCompatibili("TG1")).rejects.toThrow(/Not implemented/);
  });
});
