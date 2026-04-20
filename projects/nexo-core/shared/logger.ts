/**
 * logger — logger standard per tutti i Colleghi NEXO.
 *
 * Formato console (leggibile in tmux):
 *   2026-04-20T10:15:32Z INFO  [iris] classificata email → GUASTO_URGENTE  {...}
 *
 * Persistenza Firestore (opzionale, default on in produzione):
 *   nexo_logs/{autoId} = { at, level, collega, msg, meta?, pid, env }
 *
 * Usage:
 *   const log = new NexoLogger({ collega: "iris" });
 *   log.info("email classificata", { emailId, category });
 *   log.error("EWS fallito", { error: String(e) });
 *
 * Progettato per essere SICURO da istanziare anche prima che Firebase
 * sia inizializzato: se Firestore non è disponibile, scrive solo a
 * console (niente crash).
 */
import type { Firestore } from "firebase-admin/firestore";

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOGS_COLLECTION = "nexo_logs";

export interface NexoLoggerOptions {
  /** Nome del Collega (es. "iris", "ares"). Stampato nei log. */
  collega: string;
  /** Firestore opzionale (da `initNexo().db`). Se assente, console-only. */
  firestore?: Firestore;
  /** Persistere log su Firestore? Default true se `firestore` è passato. */
  persistOnFirestore?: boolean;
  /** Livello minimo da stampare/persistere. Default "info". */
  minLevel?: LogLevel;
  /** PID override per test. */
  pid?: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10, info: 20, warn: 30, error: 40,
};

function nowIso(): string {
  return new Date().toISOString();
}

function levelLabel(lvl: LogLevel): string {
  return lvl.toUpperCase().padEnd(5, " ");
}

export class NexoLogger {
  private readonly collega: string;
  private readonly firestore?: Firestore;
  private readonly persist: boolean;
  private readonly minLevel: LogLevel;
  private readonly pid: number;
  private readonly env: string;

  constructor(opts: NexoLoggerOptions) {
    this.collega = opts.collega;
    this.firestore = opts.firestore;
    this.persist = opts.persistOnFirestore ?? Boolean(opts.firestore);
    this.minLevel = opts.minLevel ?? "info";
    this.pid = opts.pid ?? process.pid;
    this.env = process.env.NODE_ENV || "development";
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log("debug", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.log("info", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log("warn", msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.log("error", msg, meta);
  }

  private log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const at = nowIso();
    const metaStr = meta ? "  " + safeJSONStringify(meta) : "";
    const line = `${at} ${levelLabel(level)} [${this.collega}] ${msg}${metaStr}`;

    // Console — routing level → destinazione.
    switch (level) {
      case "debug":
      case "info":
        // eslint-disable-next-line no-console
        console.log(line);
        break;
      case "warn":
        // eslint-disable-next-line no-console
        console.warn(line);
        break;
      case "error":
        // eslint-disable-next-line no-console
        console.error(line);
        break;
    }

    if (this.persist && this.firestore) {
      // Fire-and-forget: no await. Se fallisce, stampiamo a console e basta.
      this.firestore
        .collection(LOGS_COLLECTION)
        .add({
          at,
          level,
          collega: this.collega,
          msg,
          meta: meta ?? null,
          pid: this.pid,
          env: this.env,
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[logger] persist fallito: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }
}

/** JSON.stringify che non esplode su cycles (fallback "[unserializable]"). */
function safeJSONStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "[unserializable]";
  }
}
