Completa l'implementazione REALE di tutti i Colleghi. Per ciascuno:
- Connettiti a COSMINA Firestore (progetto garbymobile-f89ac) come fa MEMO
- Implementa le azioni di LETTURA reali (query Firestore)
- Le azioni di SCRITTURA vanno in DRY_RUN=true come ECHO
- Aggiorna il nexusRouter (projects/iris/functions/index.js) con handler per ogni Collega
- Aggiorna la PWA: pallino verde per i Colleghi implementati

Ordine:

1. ARES — completa interventiAperti con query reale a COSMINA. Aggiungi handler NEXUS per "interventi aperti", "interventi di oggi", "cosa c'è da fare"

2. CHRONOS — implementa scadenzeProssime leggendo cosmina_impianti campo prossima_scadenza. Implementa agendaGiornaliera. Handler NEXUS: "scadenze prossime", "agenda di Malvicino domani"

3. CHARTA — implementa fattureScadute e reportMensile se ci sono collection fatture in COSMINA. Se non ci sono, usa i dati che ha IRIS dalle email (categoria FATTURA_FORNITORE). Handler NEXUS: "fatture scadute", "report mensile"

4. EMPORION — implementa disponibilita e articoliSottoScorta leggendo da COSMINA collection magazzino_giacenze. Handler NEXUS: "c'è il pezzo X?", "cosa manca in magazzino?"

5. DIKEA — implementa scadenzeCURIT leggendo cosmina_impianti_cit. Handler NEXUS: "scadenze CURIT", "impianti senza targa"

6. DELPHI — implementa kpiDashboard aggregando dati da iris_emails + COSMINA interventi. Handler NEXUS: "come siamo andati questo mese?", "KPI"

7. PHARO — implementa statoSuite con ping delle Cloud Functions e conteggio alert. Handler NEXUS: "stato della suite", "tutto ok?"

8. CALLIOPE — implementa bozzaRisposta usando Claude Sonnet via API. Handler NEXUS: "scrivi una risposta a questa email", "bozza preventivo"

Per ogni Collega: se la collection COSMINA non esiste o è vuota, stampalo a console e vai avanti con il prossimo.

Testa TUTTO con Playwright alla fine: apri NEXUS e fai 8 domande (una per Collega). Screenshot + report testuale.

Rideploya functions + hosting.
Committa con "feat(nexo): implementazione reale tutti i Colleghi v0.1"
