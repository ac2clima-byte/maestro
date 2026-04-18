PREREQUISITO: esegui dopo scaffolding-batch5.

Aggiorna la Lavagna e crea i moduli condivisi.

1. Aggiorna projects/nexo-core/lavagna/types.ts con i tipi completi:
   - CollegaNome: tutti gli 11 + orchestrator
   - MessageType: tutti i tipi di messaggio (30+ tipi)
   - LavagnaMessage: con workflowInstanceId, workflowStepOrdine, ttlMinutes, result

2. Crea projects/nexo-core/shared/ con i moduli condivisi:

   projects/nexo-core/shared/budget.ts — BudgetGuard:
   - canSpend(stimaTokens): controlla budget giornaliero in Firestore nexo_budget
   - registraSpesa(tokens, costo): aggiorna contatore
   - spesoOggi(): ritorna stato budget

   projects/nexo-core/shared/logger.ts — NexoLogger:
   - info, warn, error con formato standard
   - Scrive a console (visibile in tmux) e a Firestore nexo_logs

   projects/nexo-core/shared/dry-run.ts — DryRunGuard:
   - isDryRun(): controlla DRY_RUN env
   - logDryRun(azione, dettagli): logga cosa avrebbe fatto

   projects/nexo-core/shared/firebase-multi.ts — Multi-progetto:
   - initNexo(): init nexo-hub-15f2d
   - initCosmina(): init acg-clima-service
   - initGuazzotti(): init guazzotti-energia

3. Stampa la struttura completa: find projects/ -type f -name "*.ts" -o -name "*.md" -o -name "*.json" | sort | head -150

4. Committa con "feat(nexo): Lavagna aggiornata + moduli condivisi"
