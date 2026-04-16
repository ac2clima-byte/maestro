Aggiorna projects/iris/TODO.md con la roadmap completa delle funzioni avanzate. Mantieni le sezioni esistenti e aggiungi una nuova sezione "Funzioni Avanzate" con queste feature, numerate e con descrizione chiara:

## Funzioni Avanzate (post v0.1)

### F1 — Sentiment Analysis
Analisi del tono emotivo del mittente per ogni email (neutro, soddisfatto, frustrato, arrabbiato, disperato). Badge visuale nella card. Tracking dell'evoluzione del sentiment nel tempo per lo stesso mittente — se il tono degenera, alert visivo.

### F2 — Thread Detection
Raggruppamento automatico delle email che appartengono alla stessa conversazione. Nella dashboard si vedono come un unico thread con timeline, non come card separate. Include evoluzione del sentiment nel thread.

### F3 — Duplicate / Follow-up Detection
Rilevamento di solleciti e email ripetute. Se un cliente scrive la stessa cosa due volte, IRIS collega le email. Timer invisibile: se una richiesta non ha risposta dopo 48 ore, IRIS segnala proattivamente "Email in attesa di risposta da X giorni."

### F4 — Smart Digest
Riassunti configurabili a orari scelti dall'utente (mattina, pranzo, sera). Ogni digest è contestualizzato: mattina = panoramica notturna, pranzo = aggiornamento mattinata, sera = riepilogo giornata. Visualizzato nella PWA come card speciale in cima alla dashboard.

### F5 — Mappa Relazioni Mittenti
Profilo automatico di ogni mittente costruito nel tempo: quanti condomini gestisce, frequenza email, pattern temporali, argomenti ricorrenti. Mini-scheda visibile nella card: "Rossi — 4 condomini, 23 email in 3 mesi, ultimo contatto 3gg fa, tende a sollecitare dopo 5gg."

### F6 — Auto-tagging Allegati
Analisi automatica degli allegati: PDF (fattura? DDT? preventivo? contratto?), foto (guasto? impianto? documento?). Estrazione dati da fatture/DDT (numero, importo, data). Anteprima nella card senza scaricare.

### F7 — Risposta Suggerita con Contesto
Bozze di risposta costruite sui dati reali dell'azienda. IRIS legge dalla Lavagna cosa stanno facendo gli altri Colleghi e usa quel contesto. Esempio: "L'intervento è programmato per giovedì, tecnico Malvicino." Approvazione con un click, mai invio automatico.

### F8 — Email Scoring e Priorità Dinamica
Punteggio 0-100 per ogni email che cambia nel tempo. Fattori: tempo senza risposta, sentiment, storico mittente, categoria, solleciti, importo. Default dashboard: ordine cronologico. Opzione: ordina per priorità con un bottone toggle.

### F9 — Riconoscimento Intent Multipli
Un'email con più richieste viene scomposta in intent separati, ciascuno con categoria e azione propria. Nella card si vedono come blocchi distinti. Esempio: "1. Sollecito preventivo → RISPONDI, 2. Segnalazione guasto → passa a EFESTO, 3. Fattura allegata → passa a Collega amministrativo."

### F10 — Watchlist Mittenti
Mittenti marcabili come "osservati speciali" con nota e motivo. Badge rosso in dashboard, sempre in evidenza. Aggiunta/rimozione con un click. Note personalizzabili ("contenzioso aperto", "rischio cambio ditta").

### F11 — Screenshot Allegati Inline
Anteprima visuale di PDF e foto direttamente nella card. Thumbnail cliccabili, galleria per foto multiple. Per fatture/DDT: estrazione dati chiave visibili come chips senza aprire il documento.

### F12 — Comparazione Email Simili Storiche
Quando arriva un'email, IRIS cerca nel suo archivio email simili già gestite. Mostra: "Caso simile il 3 marzo — risposto in 2h, assegnato a Dellafiore, risolto in giornata." Le correzioni passate su email simili migliorano la classificazione delle nuove.

Committa con "docs(iris): roadmap funzioni avanzate"
Apri il file nel browser: cmd.exe /c start projects/iris/TODO.md
