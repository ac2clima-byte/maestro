# Sprint 4 — Valore aggiunto e completamento

## Task 4.1: CALLIOPE — Bozze con contesto automatico
1. Quando l'utente chiede "scrivi risposta a Moraschi":
   - CALLIOPE cerca automaticamente in iris_emails l'ultima email da Moraschi
   - Usa il contesto dell'email (oggetto, corpo, categoria) per generare la bozza
   - Non chiedere l'ID email — trovalo da solo
2. Quando l'utente chiede "scrivi bozza preventivo per Kristal":
   - CALLIOPE chiede a MEMO il dossier Kristal
   - Usa i dati impianti per generare un preventivo contestualizzato
3. Implementa il workflow di approvazione:
   - La bozza appare nella chat NEXUS
   - Alberto risponde "ok" o "modifica: cambia il tono" → CALLIOPE revisa
   - Dopo approvazione → scrive Lavagna per ECHO (invio)
4. Template base: crea 3 template in calliope_template:
   - Risposta cliente standard
   - Sollecito pagamento (3 livelli: cortese, formale, ultimo avviso)
   - Comunicazione condominio
5. Testa con Playwright
6. Committa con "feat(calliope): bozze con contesto + workflow approvazione"

## Task 4.2: DELPHI — KPI reali e integrazione dati
1. Aggrega dati da TUTTE le fonti disponibili:
   - iris_emails: volume email, categorie, tempi risposta
   - COSMINA interventi: numero, tempi, tecnici
   - Guazzotti TEC pagamenti_clienti: esposizione, incassi
   - Guazzotti TEC rti/rtidf: stato fatturazione
2. Implementa kpiDashboard con metriche reali:
   - Email ricevute (periodo)
   - Interventi aperti/chiusi (periodo)
   - Esposizione totale clienti
   - RTI in attesa di fatturazione (numero + valore EUR)
   - Tempo medio risposta email
   - Tempo medio chiusura intervento
3. Implementa confrontoAnnoSuAnno se ci sono dati storici
4. Implementa dashboardHTML: genera pagina HTML con grafici (Chart.js)
5. Aggiorna dashboard DELPHI nella PWA con grafici reali
6. Testa: "KPI di aprile", "confronto con marzo", "quanto spendiamo di AI?"
7. Committa con "feat(delphi): KPI reali cross-source + dashboard grafici"

## Task 4.3: ECHO — Digest mattutino automatico
1. Crea Cloud Function schedulata echoDigestMattutino:
   - Gira ogni giorno alle 07:30 CET
   - Raccoglie:
     * Da IRIS: email arrivate nella notte, urgenze
     * Da ARES: interventi di oggi
     * Da PHARO: alert attivi
     * Da CHRONOS: scadenze di oggi
   - Genera riassunto testuale
   - Manda WA ad Alberto con il digest
2. Il digest deve essere breve e actionable:
   "Buongiorno. Stanotte 3 email (1 urgente: guasto caldaia Kristal). Oggi 4 interventi pianificati (Malvicino 2, Dellafiore 2). 1 alert PHARO: 27 GRTIDF pronti per fattura. Nessuna scadenza."
3. Configurabile: Alberto può disattivare via NEXUS Chat ("disattiva digest mattutino")
4. Testa: esegui manualmente il digest e verifica il WA
5. Committa con "feat(echo): digest mattutino automatico via WA"

## Task 4.4: ECHO — Ricezione WA in entrata
1. Configura webhook Waha per ricevere messaggi in entrata:
   - Waha manda un POST al webhook quando arriva un messaggio WA
   - Il webhook è una Cloud Function: echoInboundWebhook
2. La Cloud Function:
   - Riceve il messaggio WA
   - Identifica il mittente (numero → cerca in rubrica COSMINA)
   - Salva in echo_messages con direction="inbound"
   - Se il mittente è Alberto: interpreta come comando NEXUS
   - Se il mittente è un tecnico: smista al Collega appropriato
   - Se il mittente è un cliente: notifica Alberto
3. Testa: manda un WA al numero aziendale e verifica che arrivi in NEXO
4. Committa con "feat(echo): ricezione WA in entrata via webhook"

## Task 4.5: NEXUS — Contesto conversazionale
1. NEXUS attualmente tratta ogni messaggio come indipendente. Aggiungere memoria di sessione:
   - Carica gli ultimi 5 messaggi della sessione nel prompt di Haiku
   - Così NEXUS capisce "lui" o "questo" riferendosi a cose dette prima
   - Esempio: "dimmi tutto su Kristal" → risposta → "e quanti interventi hanno avuto?" → NEXUS sa che "hanno" = Kristal
2. Implementa nella Cloud Function nexusRouter:
   - Leggi nexus_chat per la sessione corrente (ultimi 5 messaggi)
   - Includi come contesto nel prompt di Haiku
3. Testa conversazione multi-turno con Playwright
4. Committa con "feat(nexus): contesto conversazionale multi-turno"

## Task 4.6: IRIS — Categoria OFFERTA_FORNITORE
1. Aggiungi la categoria OFFERTA_FORNITORE al classificatore:
   - Nel prompt classifier.md: distingui offerta (preventivo del fornitore a noi) da fattura
   - Nel tipo ClassificationType: aggiungi OFFERTA_FORNITORE
   - Nel nexusRouter: gestisci la nuova categoria
2. Riesegui la pipeline sulle email esistenti per riclassificare
3. Testa che l'email di Moraschi Roberto "Complesso immobiliare" venga classificata come OFFERTA_FORNITORE e non FATTURA_FORNITORE
4. Committa con "feat(iris): categoria OFFERTA_FORNITORE"

## Task 4.7: MAESTRO — Stabilizzazione
1. Fix conflitti git push:
   - Prima di ogni push, fai SEMPRE git pull --rebase
   - Se il rebase fallisce, fai git stash + pull + stash pop
2. Fix timeout detection:
   - Aumenta RESULT_TIMEOUT a 900_000 (15 minuti) per task grossi
   - Se timeout: NON scrivere risultato (il task resta pending e verrà riprovato)
3. Fix avvio automatico WSL:
   - Verifica che ~/.bashrc contenga il blocco MAESTRO_STARTED
   - Testa: chiudi WSL, riaprilo, verifica che MAESTRO parta
4. Aggiungi log con timestamp ad ogni azione di MAESTRO
5. Committa con "fix(maestro): stabilizzazione push + timeout + avvio"

## Task 4.8: Test finale completo v0.2
Dopo tutti gli sprint:
1. Testa OGNI Collega via NEXUS Chat (almeno 2 domande per Collega = 22 test)
2. Testa il workflow guasto urgente end-to-end
3. Testa il digest mattutino
4. Testa login dalla landing ACG Suite
5. Screenshot per ogni test
6. Analizza tutti gli screenshot
7. Crea report finale v0.2 con:
   - Colleghi: operatività reale per ciascuno
   - Handler: quanti funzionano vs stub
   - Test: passati/falliti
   - Valore economico sbloccato (RTI fatturabili, ecc.)
8. Committa con "test(nexo): report finale v0.2"
