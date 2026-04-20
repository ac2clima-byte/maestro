import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

function fakeMsg(): actions.LavagnaMessage {
  return {
    id: "m1", from: "iris", to: "orchestrator",
    type: "routing_richiesto", payload: {}, priority: "normal",
  };
}

describe("ORCHESTRATOR actions (stubs)", () => {
  it("route throws Not implemented", async () => {
    await expect(actions.route(fakeMsg())).rejects.toThrow(/Not implemented/);
  });
  it("routingIntelligente throws Not implemented", async () => {
    await expect(actions.routingIntelligente(fakeMsg())).rejects.toThrow(/Not implemented/);
  });
  it("avviaWorkflow throws Not implemented", async () => {
    await expect(
      actions.avviaWorkflow({ workflowId: "w1", triggerMsgId: "m1" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("avantiStep throws Not implemented", async () => {
    await expect(actions.avantiStep("f1")).rejects.toThrow(/Not implemented/);
  });
  it("eseguiStep throws Not implemented", async () => {
    await expect(actions.eseguiStep("f1", "s1")).rejects.toThrow(/Not implemented/);
  });
  it("checkPending throws Not implemented", async () => {
    await expect(actions.checkPending()).rejects.toThrow(/Not implemented/);
  });
  it("checkFlowTimeout throws Not implemented", async () => {
    await expect(actions.checkFlowTimeout()).rejects.toThrow(/Not implemented/);
  });
  it("escalate throws Not implemented", async () => {
    await expect(actions.escalate({ motivo: "x" })).rejects.toThrow(/Not implemented/);
  });
  it("flowAttivi throws Not implemented", async () => {
    await expect(actions.flowAttivi()).rejects.toThrow(/Not implemented/);
  });
  it("flowStorico throws Not implemented", async () => {
    await expect(actions.flowStorico()).rejects.toThrow(/Not implemented/);
  });
  it("statisticheFlow throws Not implemented", async () => {
    await expect(
      actions.statisticheFlow({ fromDate: "2026-04-01", toDate: "2026-04-30" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("listaRoutingRules throws Not implemented", async () => {
    await expect(actions.listaRoutingRules()).rejects.toThrow(/Not implemented/);
  });
  it("creaRoutingRule throws Not implemented", async () => {
    await expect(
      actions.creaRoutingRule({
        nome: "r1", priorita: 10, attiva: true,
        matchIf: {}, then: { routeTo: "ares" },
      }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("listaEscalationRules throws Not implemented", async () => {
    await expect(actions.listaEscalationRules()).rejects.toThrow(/Not implemented/);
  });
  it("creaEscalationRule throws Not implemented", async () => {
    await expect(
      actions.creaEscalationRule({
        nome: "e1", attiva: true,
        matchIf: { minutiPending: 30 }, then: { escalateTo: "echo" },
      }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("listaWorkflows throws Not implemented", async () => {
    await expect(actions.listaWorkflows()).rejects.toThrow(/Not implemented/);
  });
  it("creaWorkflow throws Not implemented", async () => {
    await expect(
      actions.creaWorkflow({
        nome: "w1", versione: 1, attivo: true,
        trigger: { tipo: "messaggio_lavagna", messageType: "x" },
        steps: [],
      }),
    ).rejects.toThrow(/Not implemented/);
  });
});
