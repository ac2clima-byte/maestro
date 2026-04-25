Sprint di stabilizzazione NEXO v0.3. Fai TUTTO in sequenza senza fermarti. Testa con Playwright dopo ogni step.

## 1. FIX POLLING IRIS

Il polling email non funziona. Le email sono ferme.

a. Verifica se il poller locale è attivo: ps aux | grep iris | grep -v grep
b. Esegui manualmente la pipeline: cd projects/iris/scripts && python3 pipeline.py 2>&1
c. Se funziona: quante email nuove importate? Stampa il risultato
d. Se non funziona: stampa l'errore completo
e. Se il problema è le credenziali: cercale in /mnt/c/HERMES/.env o projects/iris/.env
f. Configura un cron locale: crontab -e → */5 * * * * cd ~/maestro-bridge/projects/iris/scripts && python3 pipeline.py >> ~/maestro-bridge/logs/iris_poller.log 2>&1
g. Verifica che il cron sia attivo: crontab -l
h. Testa: aspetta 5 minuti, verifica nuove email in iris_emails
i. Committa con "fix(iris): polling locale attivo"

## 2. FIX LINGUAGGIO NATURALE NEXUS

NEXUS risponde ancora con emoji, bold, bullet point. Il system prompt non viene applicato.

a. Apri handlers/nexus.js
b. Trova DOVE viene composto il messaggio per Haiku (la variabile systemPrompt o messages)
c. Aggiungi IN CIMA al system prompt (PRIMA di qualsiasi altra istruzione):

"REGOLA ASSOLUTA: rispondi in italiano naturale come un collega che parla. Niente emoji. Niente bold (**). Niente elenchi puntati (· o -). Niente formato campo: valore. Frasi complete come se parlassi a voce. Se devi elencare numeri, fallo in una frase: 'Hai 103 email, di cui 35 senza risposta da più di 2 giorni' non '· Email: 103 · Senza risposta: 35'."

d. Cerca TUTTI i punti dove la risposta viene formattata DOPO Haiku (potrebbe essere che il codice aggiunge emoji/bold alla risposta di Haiku). Rimuovi qualsiasi formattazione post-processing.
e. Cerca "🚨", "📊", "📬", "📤", "**", "· " nel codice degli handler e rimuovi questi pattern hardcodati
f. Deploy functions
g. Testa con Playwright 5 domande:
   - "stato della suite"
   - "quante email ho?"
   - "come va?"
   - "manda whatsapp a Alberto: test"
   - "bozze pendenti"
   Verifica che NESSUNA risposta contenga emoji, bold, o bullet point.
h. Screenshot + analisi testuale di ogni risposta
i. Committa con "fix(nexus): linguaggio naturale applicato a tutti gli handler"

## 3. FIX CHARTA DATI REALI

CHARTA conta solo email classificate, non dati contabili veri.

a. Leggi context/memo-guazzotti-tec-map.md per la struttura di pagamenti_clienti
b. In handlers/charta.js, aggiorna gli handler:
   - handleChartaReportMensile: leggi da pagamenti_clienti su guazzotti-tec + iris_emails
   - handleChartaFattureScadute: leggi da pagamenti_clienti dove esposizione > 0
   - handleChartaEsposizioneCliente: leggi il documento specifico del cliente
c. Se pagamenti_clienti non è raggiungibile (permessi): usa gcloud per aggiungere permessi
d. Deploy functions
e. Testa: "report mensile", "fatture scadute", "esposizione cliente Kristal"
f. Committa con "feat(charta): dati reali da Guazzotti TEC pagamenti_clienti"

## 4. MODULARIZZA PWA

index.html è 4411 righe. Spezzala.

a. Crea la struttura:
   projects/nexo-pwa/public/
   ├── index.html (shell: head, nav, script imports)
   ├── css/
   │   ├── main.css (stili globali, design system DOC)
   │   ├── sidebar.css
   │   ├── chat.css (stile NEXUS)
   │   └── colleghi.css (pagine colleghi)
   ├── js/
   │   ├── app.js (init, routing, auth)
   │   ├── sidebar.js
   │   ├── chat.js (NEXUS chat logic)
   │   ├── voice.js (TTS + microfono)
   │   ├── iris.js (pagina IRIS)
   │   ├── chronos.js (pagina CHRONOS)
   │   ├── pharo.js (pagina PHARO)
   │   ├── colleghi.js (pagine altri colleghi)
   │   └── utils.js (Firebase init, fetch helpers)
   └── sw.js

b. Estrai da index.html: tutto il CSS → file .css, tutto il JS → file .js
c. index.html finale deve essere < 100 righe (solo shell HTML + script/link tags)
d. IMPORTANTE: non rompere nulla. Dopo la modularizzazione TUTTO deve funzionare come prima.
e. Testa con Playwright: naviga ogni pagina, apri chat, scrivi messaggio, verifica risposta
f. Testa anche su viewport mobile (375x812)
g. Se qualcosa è rotto: fixa prima di committare
h. Committa con "refactor(pwa): modularizzazione - da 4411 righe a moduli separati"

## 5. TEST FINALE

Testa TUTTO con Playwright:
1. Login
2. Dashboard home
3. Ogni pagina Collega (11 pagine)
4. NEXUS Chat: 5 domande diverse
5. Verifica linguaggio naturale in tutte le risposte
6. Verifica responsive mobile
7. Screenshot + report

Crea results/v03-stabilizzazione.html con tutti i risultati.
Committa con "test(nexo): v0.3 stabilizzazione completa"
