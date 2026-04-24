Ci sono 7 preventivi di test duplicati in calliope_bozze e charta_preventivi. Pulisci.

1. Cancella TUTTI i preventivi tranne l'ultimo (PREV-2026-981524, €1.220,00):
   - Elimina da calliope_bozze i documenti con isTest=true o con numero diverso da PREV-2026-981524
   - Elimina da charta_preventivi gli stessi

2. Cancella anche i documenti di test in iris_emails con isTest=true

3. Cancella i messaggi di test dalla nexo_lavagna con tipo preparare_preventivo (quelli vecchi)

4. Verifica: "bozze pendenti" in NEXUS deve mostrare solo 1 preventivo

5. Committa con "fix: pulizia preventivi di test"
