/**
 * dry-run — utility condivisa per la modalità "mostra ma non fare".
 *
 * Uso tipico in un Collega:
 *
 *   const dry = new DryRunGuard({ colleague: "ares" });
 *   if (dry.isDryRun()) {
 *     dry.logDryRun("apriIntervento", { tipo, urgenza, ...input });
 *     return makeFakeResponse();
 *   }
 *   // ...esecuzione reale...
 *
 * Può anche essere usato in modalità "wrap":
 *
 *   const result = await dry.guard("sendWhatsApp", payload, async () => {
 *     return await realSend(payload);
 *   });
 *
 * `isDryRun()` legge `DRY_RUN` dall'environment (case-insensitive).
 * Override esplicito via costruttore (utile nei test).
 */
import { NexoLogger } from "./logger.js";

export interface DryRunOptions {
  /** Nome del Collega per il log (es. "ares", "charta"). */
  colleague: string;
  /** Forza il valore invece di leggere da env. Utile nei test. */
  force?: boolean;
  /** Logger opzionale (default: NexoLogger console-only). */
  logger?: NexoLogger;
}

export class DryRunGuard {
  private readonly colleague: string;
  private readonly forced?: boolean;
  private readonly logger: NexoLogger;

  constructor(opts: DryRunOptions) {
    this.colleague = opts.colleague;
    this.forced = opts.force;
    this.logger = opts.logger ?? new NexoLogger({ collega: opts.colleague, persistOnFirestore: false });
  }

  /** True se il Collega sta girando in modalità dry-run. */
  isDryRun(): boolean {
    if (this.forced !== undefined) return this.forced;
    return (process.env.DRY_RUN ?? "false").toLowerCase() === "true";
  }

  /**
   * Logga un'azione che sarebbe stata eseguita. Non ritorna nulla.
   * Il chiamante deve costruire una risposta sintetica.
   */
  logDryRun(azione: string, dettagli: Record<string, unknown>): void {
    this.logger.info(`[DRY-RUN] ${azione}`, {
      colleague: this.colleague,
      azione,
      dettagli,
    });
  }

  /**
   * Wrapper: se dry-run, logga e ritorna `fallback`. Altrimenti esegue
   * `execute()` e ritorna il suo risultato.
   *
   * `fallback` serve a rispettare il contratto della funzione chiamante
   * (es. ritornare un `Intervento` finto con flag `dryRun: true`).
   */
  async guard<T>(
    azione: string,
    dettagli: Record<string, unknown>,
    execute: () => Promise<T>,
    fallback?: () => T,
  ): Promise<T> {
    if (this.isDryRun()) {
      this.logDryRun(azione, dettagli);
      if (fallback) return fallback();
      throw new Error(
        `DryRunGuard: azione "${azione}" in dry-run senza fallback. ` +
        `Passa un fallback o gestisci isDryRun() manualmente.`,
      );
    }
    return execute();
  }
}
