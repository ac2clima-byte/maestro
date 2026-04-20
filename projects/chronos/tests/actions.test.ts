import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

describe("CHRONOS actions (stubs)", () => {
  it("slotDisponibili throws Not implemented", async () => {
    await expect(
      actions.slotDisponibili({ durataMin: 60, fromDate: "2026-04-21", toDate: "2026-04-22" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("agendaGiornaliera throws Not implemented", async () => {
    await expect(actions.agendaGiornaliera("u1", "2026-04-21")).rejects.toThrow(/Not implemented/);
  });
  it("agendaSettimanale throws Not implemented", async () => {
    await expect(actions.agendaSettimanale("u1", "2026-W17")).rejects.toThrow(/Not implemented/);
  });
  it("prenotaSlot throws Not implemented", async () => {
    await expect(
      actions.prenotaSlot({
        tecnicoUid: "u1", data: "2026-04-21", oraInizio: "09:00", durataMin: 60, interventoId: "i1",
      }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("liberaSlot throws Not implemented", async () => {
    await expect(actions.liberaSlot("s1")).rejects.toThrow(/Not implemented/);
  });
  it("scadenzeProssime throws Not implemented", async () => {
    await expect(actions.scadenzeProssime()).rejects.toThrow(/Not implemented/);
  });
  it("scadenzeScadute throws Not implemented", async () => {
    await expect(actions.scadenzeScadute()).rejects.toThrow(/Not implemented/);
  });
  it("pianificaCampagna throws Not implemented", async () => {
    await expect(
      actions.pianificaCampagna({ nome: "x", anno: 2026, comuni: ["AL"], tipo: "spegnimento" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("trovaConflitti throws Not implemented", async () => {
    await expect(actions.trovaConflitti("2026-04-21")).rejects.toThrow(/Not implemented/);
  });
  it("riprogramma throws Not implemented", async () => {
    await expect(actions.riprogramma("s1", "2026-04-22")).rejects.toThrow(/Not implemented/);
  });
  it("ottimizzaGiornata throws Not implemented", async () => {
    await expect(actions.ottimizzaGiornata("u1", "2026-04-21")).rejects.toThrow(/Not implemented/);
  });
  it("registraFerie throws Not implemented", async () => {
    await expect(actions.registraFerie("u1", "2026-08-01", "2026-08-15")).rejects.toThrow(/Not implemented/);
  });
  it("registraMalattia throws Not implemented", async () => {
    await expect(actions.registraMalattia("u1", "2026-04-21")).rejects.toThrow(/Not implemented/);
  });
});
