Crea un Excel con TUTTO quello che vale la pena monitorare nella Suite ACG e mandalo via email ad Alberto.

## 1. Analizza tutte le fonti dati

Usa la conoscenza di MEMO (context/memo-*.md) per elencare OGNI cosa monitorabile:

Da COSMINA (garbymobile-f89ac):
- Campagne: stato, avanzamento, scaduti
- Bacheca cards: interventi aperti, programmati, scaduti, per tecnico
- Impianti: scadenze manutenzione, impianti senza targa, senza CIT
- Clienti: contratti in scadenza, clienti inattivi

Da Guazzotti TEC (guazzotti-tec):
- RTI: bozze vecchie, definiti senza RTIDF, per tecnico
- RTIDF: senza costo, pronti fattura, orfani
- Tickets: aperti >30g, chiusi senza RTI, tempo medio chiusura
- Pagamenti: esposizione clienti, scaduti

Da IRIS (nexo-hub):
- Email: urgenti, senza risposta >48h, volume giornaliero
- Classificazione: distribuzione categorie

Da PHARO:
- Stato servizi, heartbeat, budget AI

## 2. Crea l'Excel

Crea un file Excel con openpyxl: scripts/report_monitoraggio.xlsx

Foglio 1 "CATALOGO MONITORAGGIO":
Colonne: Categoria | Elemento | Descrizione | Fonte Dati | Collection | Frequenza Suggerita | Severità | Badge CHRONOS (sì/no) | Note

Riempi con TUTTE le cose monitorabili (almeno 50 righe).
Categorie: Campagne, Interventi, RTI/RTIDF, Fatturazione, Scadenze, Impianti, Email, Tecnici, Magazzino, Compliance, Infrastruttura

Foglio 2 "NUMERI ATTUALI":
Per ogni elemento monitorabile, scrivi il valore attuale letto da Firestore.
Colonne: Elemento | Valore Attuale | Soglia Warning | Soglia Critical | Stato

Foglio 3 "PER TECNICO":
Breakdown per tecnico dei KPI principali (interventi, RTI, bozze vecchie, ecc.)

## 3. Manda via email

Usa exchangelib (come IRIS) per mandare l'email:
- Da: alberto.contardi@acgclimaservice.com
- A: alberto.contardi@acgclimaservice.com (a se stesso)
- Oggetto: "NEXO — Catalogo completo elementi monitorabili"
- Corpo: "In allegato il catalogo completo di tutto ciò che NEXO può monitorare dalla Suite ACG. Seleziona gli elementi che vuoi come badge su CHRONOS."
- Allegato: report_monitoraggio.xlsx

Se exchangelib non funziona (server EWS non raggiungibile), salva il file in projects/nexo-pwa/ e aprilo nel browser con cmd.exe /c start

## 4. Committa con "feat(memo): catalogo monitoraggio completo + Excel"
