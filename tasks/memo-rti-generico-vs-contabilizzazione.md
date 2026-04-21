IMPORTANTE — chiarimento da Alberto sui tipi di RTI.

Ci sono DUE tipi diversi di RTI:
- GRTI = RTI Generico (intervento standard: riparazione, manutenzione)
- CRTI = RTI Contabilizzazione (lettura contatori, ripartizione consumi UNI 10200)

Stesso vale per RTIDF:
- GRTIDF = RTI Definitivo Generico
- CRTIDF = RTI Definitivo Contabilizzazione

Sono documenti DIVERSI con campi diversi e workflow diversi. Gli alert devono essere separati per tipo.

STEP:

1. Analizza separatamente GRTI e CRTI nella collection rti:
   - Quanti GRTI? Quanti CRTI?
   - Campi diversi tra i due tipi?
   - Workflow diverso? (stati, transizioni)
   
2. Analizza separatamente GRTIDF e CRTIDF nella collection rtidf:
   - Quanti GRTIDF? Quanti CRTIDF?
   - Match con rti: quanti GRTI senza GRTIDF? Quanti CRTI senza CRTIDF?

3. Aggiorna context/memo-analisi-rti-rtidf.md (o crealo se non esiste) con:
   - Sezione separata per Generico e Contabilizzazione
   - Schema campi per ciascun tipo
   - Numeri separati (orfani generico vs orfani contabilizzazione)
   - Alert suggeriti SEPARATI per tipo:
     * Alert specifici per GRTI/GRTIDF (es: intervento senza rapporto definitivo)
     * Alert specifici per CRTI/CRTIDF (es: lettura contatori non finalizzata)

4. Stampa a console le differenze chiave tra generico e contabilizzazione

5. Committa con "feat(memo): analisi RTI generico vs contabilizzazione separata"
