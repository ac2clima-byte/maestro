import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("MEMO actions (stubs)", () => {
  it("dossierCliente throws Not implemented", async () => {
    await expect(actions.dossierCliente("c1")).rejects.toThrow(/Not implemented/);
  });
  it("dossierCondominio throws Not implemented", async () => {
    await expect(actions.dossierCondominio("cond1")).rejects.toThrow(/Not implemented/);
  });
  it("storicoImpianto throws Not implemented", async () => {
    await expect(actions.storicoImpianto("TG1")).rejects.toThrow(/Not implemented/);
  });
  it("cercaDocumenti throws Not implemented", async () => {
    await expect(actions.cercaDocumenti({ testo: "contratto" })).rejects.toThrow(/Not implemented/);
  });
  it("ultimiContatti throws Not implemented", async () => {
    await expect(actions.ultimiContatti("c1")).rejects.toThrow(/Not implemented/);
  });
  it("matchAnagrafica throws Not implemented", async () => {
    await expect(actions.matchAnagrafica({ nome: "Rossi" })).rejects.toThrow(/Not implemented/);
  });
  it("nuovoCliente throws Not implemented", async () => {
    await expect(
      actions.nuovoCliente({ nome: "Test", tipo: "privato" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("collegaEntita throws Not implemented", async () => {
    await expect(
      actions.collegaEntita({ tipo: "impianto", id: "i1" }, { tipo: "condominio", id: "c1" }, "appartiene_a"),
    ).rejects.toThrow(/Not implemented/);
  });
  it("consumiMedi throws Not implemented", async () => {
    await expect(actions.consumiMedi("cond1")).rejects.toThrow(/Not implemented/);
  });
  it("rischioChurn throws Not implemented", async () => {
    await expect(actions.rischioChurn("c1")).rejects.toThrow(/Not implemented/);
  });
  it("cercaPerContesto throws Not implemented", async () => {
    await expect(actions.cercaPerContesto("centrale termica voghera")).rejects.toThrow(/Not implemented/);
  });
});
