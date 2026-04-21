Gli alert PHARO sugli RTI/RTIDF hanno falsi positivi. MEMO ha i dati per correggerli.

REGOLE DI BUSINESS da applicare (confermate da Alberto):

1. ESCLUDERE FATTURATI:
   - RTI con stato rtidf_fatturato → ESCLUDI da tutti gli alert (già fatturato)
   - RTIDF con stato fatturato → ESCLUDI (già fatturato)
   - Non segnalare MAI come "ricavo bloccato" qualcosa già fatturato

2. ESCLUDERE NON FATTURABILI:
   - RTI con campo fatturabile=false → NON deve generare RTIDF → NON è un alert
   - L'alert "RTI definito senza RTIDF" deve filtrare SOLO i fatturabile=true
   - L'alert "ricavi bloccati" deve contare SOLO i fatturabili

3. RICALCOLA I NUMERI:
   - Quanti dei 291 GRTI "definito senza RTIDF" hanno fatturabile=true? Solo quelli contano
   - Quanti dei 348 RTI totali "senza RTIDF" sono effettivamente fatturabili?
   - Il valore €5.670 va ricalcolato solo sui fatturabili

4. CONTABILIZZAZIONE:
   - CRTIDF senza costo_intervento è NORMALE → NON è un alert
   - Bozze CRTI vecchie restano un alert valido (backlog Lorenzo)

5. Aggiorna context/memo-analisi-rti-rtidf.md con i numeri corretti

6. Aggiorna l'handler handlePharoRtiMonitoring nella Cloud Function:
   - Tutti i query devono filtrare fatturabile=true dove pertinente
   - Escludere stati fatturato/rtidf_fatturato
   - Ricalcolare il valore economico bloccato

7. Aggiorna la dashboard PHARO nella PWA con i numeri corretti

8. Rideploya functions + hosting

9. Committa con "fix(pharo): escludi fatturati e non fatturabili dagli alert RTI"
