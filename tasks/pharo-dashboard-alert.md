Crea una dashboard alert reale nella pagina PHARO della PWA.

CONTESTO:
MEMO ha mappato Guazzotti TEC (context/memo-guazzotti-tec-map.md). Le collection chiave sono:
- rti (~500 docs): Rapporti Tecnici Intervento
- rtidf (~195 docs): RTI Definitivi (congelati per fatturazione)
- pending_rti (84 docs): card in attesa di diventare RTI
- tickets (~500 docs): ticket assistenza
- pagamenti_clienti (100+ docs): esposizione creditoria

COSA FARE:

1. Aggiorna la pagina PHARO nella PWA (projects/nexo-pwa/public/index.html) con:

   a. SEZIONE ALERT ATTIVI:
      - Lista alert con badge severità (info/warning/critical)
      - Per ogni alert: titolo, descrizione, quando rilevato, bottone "risolvi"
      - Legge da Firestore pharo_alerts

   b. SEZIONE MONITORING RTI (dati da Guazzotti TEC):
      - RTI totali vs RTIDF totali (quanti RTI non hanno ancora un RTIDF?)
      - RTI in stato bozza da più di 7 giorni (alert warning)
      - pending_rti: quante card sono in attesa (84 è tanto?)
      - Tickets aperti senza RTI collegato
      - Tabella con dettaglio: numero RTI, data, stato, tecnico, se ha RTIDF

   c. SEZIONE REGOLE MONITORING:
      - Lista regole configurabili con toggle on/off
      - Per ogni regola: nome, condizione, severità, canale notifica
      - Bottone "Aggiungi regola"
      - Regole predefinite:
        * "RTI senza RTIDF da più di 7 giorni" → warning
        * "Pending RTI da più di 3 giorni" → warning
        * "Ticket aperto da più di 14 giorni senza RTI" → critical
        * "RTIDF senza fatturazione" → info

   d. SEZIONE STATISTICHE:
      - RTI per mese (grafico a barre)
      - Tempo medio da RTI a RTIDF
      - Top 5 tecnici per RTI generati

2. Per leggere i dati da Guazzotti TEC: 
   - La PWA frontend NON può accedere direttamente a guazzotti-tec Firestore (cross-project)
   - Aggiungi un handler nel nexusRouter Cloud Function: handlePharoRtiMonitoring
   - L'handler legge da guazzotti-tec e ritorna i dati aggregati
   - La PWA chiama questo endpoint

3. Crea anche una Cloud Function schedulata "pharoCheckRti" che ogni 6 ore:
   - Controlla RTI senza RTIDF
   - Controlla pending_rti vecchi
   - Controlla tickets senza RTI
   - Se trova problemi → scrive alert in pharo_alerts
   - Se alert critical → scrive Lavagna per ECHO (WA ad Alberto)

4. Rideploya functions + hosting
5. Testa con Playwright: apri pagina PHARO, screenshot, analisi testuale
6. Committa con "feat(pharo): dashboard alert RTI con dati Guazzotti TEC"
