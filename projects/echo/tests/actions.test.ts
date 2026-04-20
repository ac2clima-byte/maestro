import { describe, it, expect } from "vitest";
import * as actions from "../src/actions/index.js";

/**
 * Placeholder: gli stub devono lanciare "Not implemented".
 * Quando un'azione viene implementata, sostituire il test corrispondente
 * con uno reale (mock dei provider esterni, asserzioni sull'output).
 */
describe("ECHO actions (stubs)", () => {
  it("sendMessage throws Not implemented", async () => {
    await expect(actions.sendMessage("whatsapp", "+39...", "ciao")).rejects.toThrow(/Not implemented/);
  });
  it("sendWhatsApp throws Not implemented", async () => {
    await expect(actions.sendWhatsApp("+39...", "ciao")).rejects.toThrow(/Not implemented/);
  });
  it("sendTelegram throws Not implemented", async () => {
    await expect(actions.sendTelegram("123", "ciao")).rejects.toThrow(/Not implemented/);
  });
  it("sendEmail throws Not implemented", async () => {
    await expect(actions.sendEmail("a@b.it", "subj", "body")).rejects.toThrow(/Not implemented/);
  });
  it("sendPushNotification throws Not implemented", async () => {
    await expect(actions.sendPushNotification("uid1", "t", "b")).rejects.toThrow(/Not implemented/);
  });
  it("speak throws Not implemented", async () => {
    await expect(actions.speak("ciao")).rejects.toThrow(/Not implemented/);
  });
  it("transcribe throws Not implemented", async () => {
    await expect(actions.transcribe("file:///tmp/x.wav")).rejects.toThrow(/Not implemented/);
  });
  it("generaDigest throws Not implemented", async () => {
    await expect(
      actions.generaDigest({ sections: ["email"], forUserUid: "u1" }),
    ).rejects.toThrow(/Not implemented/);
  });
  it("onWhatsAppIncoming throws Not implemented", async () => {
    await expect(actions.onWhatsAppIncoming({})).rejects.toThrow(/Not implemented/);
  });
  it("onTelegramIncoming throws Not implemented", async () => {
    await expect(actions.onTelegramIncoming({})).rejects.toThrow(/Not implemented/);
  });
});
