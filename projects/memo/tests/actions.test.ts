import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

/**
 * Test v0.1:
 *   · Le azioni v0.1 implementate (dossier, match, storico, ecc.) sono
 *     testabili solo con mock Firestore — per ora verifico che siano
 *     FUNCTION exports (smoke).
 *   · Le azioni v0.2 (nuovoCliente, collegaEntita, consumiMedi,
 *     rischioChurn) devono ancora lanciare "Not implemented".
 */

describe("MEMO v0.1 actions (smoke)", () => {
  it("dossierCliente is implemented (function export)", () => {
    expect(typeof actions.dossierCliente).toBe("function");
  });
  it("dossierCondominio is implemented", () => {
    expect(typeof actions.dossierCondominio).toBe("function");
  });
  it("storicoImpianto is implemented", () => {
    expect(typeof actions.storicoImpianto).toBe("function");
  });
  it("matchAnagrafica is implemented", () => {
    expect(typeof actions.matchAnagrafica).toBe("function");
  });
  it("cercaPerContesto is implemented", () => {
    expect(typeof actions.cercaPerContesto).toBe("function");
  });
  it("ultimiContatti is implemented", () => {
    expect(typeof actions.ultimiContatti).toBe("function");
  });
});

describe("MEMO v0.2 actions (stubs)", () => {
  it("nuovoCliente throws Not implemented", async () => {
    await expect(
      actions.nuovoCliente({ nome: "Test", tipo: "privato" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("collegaEntita throws Not implemented", async () => {
    await expect(
      actions.collegaEntita(
        { tipo: "impianto", id: "i1" },
        { tipo: "condominio", id: "c1" },
        "appartiene_a",
      ),
    ).rejects.toThrow(/Not implemented/);
  });
  it("consumiMedi throws Not implemented", async () => {
    await expect(actions.consumiMedi("cond1")).rejects.toThrow(/Not implemented/);
  });
  it("rischioChurn throws Not implemented", async () => {
    await expect(actions.rischioChurn("c1")).rejects.toThrow(/Not implemented/);
  });
});
