/**
 * shared — entrypoint dei moduli condivisi NEXO.
 *
 * Importa da qui:
 *   import {
 *     initNexo, initCosmina, initGuazzotti,
 *     NexoLogger,
 *     DryRunGuard,
 *     BudgetGuard, BudgetExceededError,
 *   } from "../../nexo-core/shared/index.js";
 */
export {
  initNexo,
  initCosmina,
  initGuazzotti,
  initByName,
  NEXO_PROJECT_ID,
  COSMINA_PROJECT_ID,
  GUAZZOTTI_PROJECT_ID,
  type FirebaseHandle,
} from "./firebase-multi.js";

export {
  NexoLogger,
  LOGS_COLLECTION,
  type LogLevel,
  type NexoLoggerOptions,
} from "./logger.js";

export {
  DryRunGuard,
  type DryRunOptions,
} from "./dry-run.js";

export {
  BudgetGuard,
  BudgetExceededError,
  BUDGET_COLLECTION,
  BUDGET_DEFAULT_DAILY_EUR,
  DEFAULT_MODEL_PRICING,
  type BudgetGuardOptions,
  type CanSpendInput,
  type CanSpendResult,
  type RegistraSpesaInput,
  type SpesoOggiResult,
} from "./budget.js";
