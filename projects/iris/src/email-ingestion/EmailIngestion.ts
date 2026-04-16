import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { Email } from "../types/email.js";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export type Spawner = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => Promise<SpawnResult>;

export interface EmailIngestionOptions {
  pythonBin?: string;
  scriptPath?: string;
  env?: NodeJS.ProcessEnv;
  spawner?: Spawner;
}

const defaultSpawner: Spawner = (command, args, env) =>
  new Promise<SpawnResult>((resolvePromise, rejectPromise) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, { env });
    } catch (err) {
      rejectPromise(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ stdout, stderr, code });
    });
  });

function defaultScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "ews_poller.py");
}

export class EmailIngestion {
  private readonly pythonBin: string;
  private readonly scriptPath: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly spawner: Spawner;

  constructor(options: EmailIngestionOptions = {}) {
    this.pythonBin = options.pythonBin ?? "python3";
    this.scriptPath = options.scriptPath ?? defaultScriptPath();
    this.env = options.env ?? process.env;
    this.spawner = options.spawner ?? defaultSpawner;
  }

  async poll(): Promise<Email[]> {
    const result = await this.spawner(
      this.pythonBin,
      [this.scriptPath],
      this.env,
    );

    if (result.code !== 0) {
      const stderr = result.stderr.trim();
      throw new Error(
        `ews_poller.py exited with code ${result.code}${
          stderr ? `: ${stderr}` : ""
        }`,
      );
    }

    return parseJsonLines(result.stdout);
  }
}

export function parseJsonLines(output: string): Email[] {
  if (!output) return [];
  const lines = output.split("\n");
  const emails: Email[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = JSON.parse(line) as Email;
    emails.push(parsed);
  }
  return emails;
}
