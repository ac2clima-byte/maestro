import { describe, it, expect } from "vitest";

import {
  EmailIngestion,
  type Spawner,
  type SpawnResult,
} from "../src/email-ingestion/EmailIngestion.js";
import type { Email } from "../src/types/email.js";

function fakeSpawner(result: SpawnResult): Spawner {
  return async () => result;
}

function sampleEmail(overrides: Partial<Email> = {}): Email {
  return {
    message_id: "<abc@corp.local>",
    subject: "Richiesta intervento caldaia",
    sender: "mario.rossi@example.com",
    received_time: "2026-04-16T18:00:00+00:00",
    body_text: "Buongiorno, la caldaia perde acqua.",
    has_attachments: false,
    importance: "Normal",
    ...overrides,
  };
}

describe("EmailIngestion.poll", () => {
  it("parses a single email correctly", async () => {
    const email = sampleEmail();
    const stdout = JSON.stringify(email) + "\n";
    const ingestion = new EmailIngestion({
      spawner: fakeSpawner({ stdout, stderr: "", code: 0 }),
    });

    const emails = await ingestion.poll();

    expect(emails).toHaveLength(1);
    expect(emails[0]).toEqual(email);
  });

  it("parses multiple emails (JSON Lines)", async () => {
    const first = sampleEmail({ message_id: "<1@corp.local>", subject: "Uno" });
    const second = sampleEmail({
      message_id: "<2@corp.local>",
      subject: "Due",
      importance: "High",
    });
    const third = sampleEmail({
      message_id: "<3@corp.local>",
      subject: "Tre",
      has_attachments: true,
    });
    const stdout = [first, second, third]
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n";

    const ingestion = new EmailIngestion({
      spawner: fakeSpawner({ stdout, stderr: "", code: 0 }),
    });

    const emails = await ingestion.poll();

    expect(emails).toHaveLength(3);
    expect(emails.map((e) => e.subject)).toEqual(["Uno", "Due", "Tre"]);
    expect(emails[1].importance).toBe("High");
    expect(emails[2].has_attachments).toBe(true);
  });

  it("returns an empty array when there are no new emails", async () => {
    const ingestion = new EmailIngestion({
      spawner: fakeSpawner({ stdout: "", stderr: "", code: 0 }),
    });

    const emails = await ingestion.poll();

    expect(emails).toEqual([]);
  });

  it("also returns empty for whitespace-only stdout", async () => {
    const ingestion = new EmailIngestion({
      spawner: fakeSpawner({ stdout: "\n\n  \n", stderr: "", code: 0 }),
    });

    const emails = await ingestion.poll();

    expect(emails).toEqual([]);
  });

  it("throws when the subprocess exits with a non-zero code", async () => {
    const ingestion = new EmailIngestion({
      spawner: fakeSpawner({
        stdout: "",
        stderr: "Missing required env var: EWS_URL",
        code: 2,
      }),
    });

    await expect(ingestion.poll()).rejects.toThrow(
      /exited with code 2.*EWS_URL/,
    );
  });

  it("throws when the subprocess exits with code 1 and no stderr", async () => {
    const ingestion = new EmailIngestion({
      spawner: fakeSpawner({ stdout: "", stderr: "", code: 1 }),
    });

    await expect(ingestion.poll()).rejects.toThrow(/exited with code 1/);
  });
});
