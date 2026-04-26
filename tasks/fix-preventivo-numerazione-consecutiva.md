I preventivi devono avere numerazione consecutiva (PRE-001/2026, PRE-002/2026, PRE-003/2026...) senza buchi.

## Problema attuale
Ogni test FORGE genera un numero progressivo. I numeri di test (PRE-001 a PRE-005) sporcano la numerazione. I preventivi reali devono partire da un numero pulito.

## Fix

1. Usa graph_counters su garbymobile-f89ac per il numero progressivo:
   - Collection: graph_counters
   - Documento: "preventivo" (o "PRE")
   - Campo: lastNumber (integer)
   - Incrementa con FieldValue.increment(1) atomico (no race condition)

2. Se graph_counters non ha il documento "preventivo", crealo con lastNumber: 0

3. Il numero deve essere: PRE-{numero padded 3 cifre}/{anno}
   - PRE-001/2026, PRE-002/2026, ...
   - Quando supera 999: PRE-1000/2026

4. I preventivi FORGE di test (sessionId che inizia con "forge-test") NON devono incrementare il contatore reale:
   - Usa un contatore separato: graph_counters/preventivo_test
   - Oppure non generare numeri per i test FORGE

5. Pulisci i numeri di test già generati:
   - Resetta graph_counters/preventivo.lastNumber al numero dell'ultimo preventivo REALE
   - Elimina i documenti di test da docfin_documents e graph_documents

6. Verifica: il prossimo preventivo reale deve essere PRE-001/2026 (se non ce ne sono di reali) o il successivo all'ultimo reale

Deploy + test + email report.
Committa con "fix(preventivo): numerazione consecutiva senza buchi"
