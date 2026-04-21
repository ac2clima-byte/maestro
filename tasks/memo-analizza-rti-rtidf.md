MEMO deve analizzare i dati reali di RTI e RTIDF su Guazzotti TEC e suggerire alert intelligenti per PHARO.

STEP:

1. Connettiti a Firestore guazzotti-tec e analizza i dati reali:

   a. Collection rti: leggi 20 documenti, analizza:
      - Quali stati esistono? (bozza, definitivo, altro?)
      - Quali campi sono presenti/mancanti?
      - Come si collega a rtidf? (stesso numero? campo reference?)
      - Quanti RTI non hanno un corrispondente RTIDF?
      - Quanti RTI hanno campi importanti vuoti (ore, materiali, tecnico, importo)?
      - Da quanto tempo i più vecchi sono in bozza?

   b. Collection rtidf: leggi 20 documenti, analizza:
      - Struttura campi
      - Come si collega a rti?
      - Ci sono RTIDF senza RTI corrispondente?
      - Campi contabilizzazione: sono compilati?

   c. Collection pending_rti: leggi 20 documenti, analizza:
      - Da quanto tempo sono pending? (campo createdAt o simile)
      - Quanti sono vecchi di più di 7 giorni?
      - Hanno un ticket collegato?

   d. Collection tickets: leggi 20 documenti, analizza:
      - Quali stati esistono?
      - Quanti sono aperti?
      - Quanti chiusi senza RTI?
      - Tempo medio da apertura a chiusura

2. Basandoti sui dati REALI (non su ipotesi), suggerisci una lista di alert per PHARO:
   - Per ogni alert: nome, condizione, severità (info/warning/critical), query Firestore da eseguire
   - Ordina per impatto economico (prima gli alert che bloccano fatturazione)

3. Salva l'analisi in context/memo-analisi-rti-rtidf.md con:
   - Schema reale dei campi trovati (non ipotizzati)
   - Relazioni reali tra collection
   - Numeri reali (quanti orfani, quanti incompleti, quanti vecchi)
   - Lista alert suggeriti con query

4. Stampa a console un riassunto dei problemi trovati

5. Committa con "feat(memo): analisi RTI/RTIDF con suggerimenti alert per PHARO"
