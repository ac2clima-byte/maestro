Esegui i 15 test FORGE reali e scrivi OGNI domanda e risposta nella chat NEXUS (sessione "forge-test") così Alberto le vede nella PWA.

## Prerequisiti

1. L'endpoint nexusTestInternal deve essere deployato e funzionante
2. Verifica: curl -s -X POST https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal -H "Content-Type: application/json" -d '{"message":"ciao","forgeKey":"nexo-forge-2026"}'
3. Se ritorna errore → fixa e rideploya prima di procedere

## Le 15 domande

Esegui IN SEQUENZA ogni domanda. Per ognuna:
- Chiama nexusTestInternal con la domanda
- La Cloud Function DEVE scrivere sia la domanda (role:user) che la risposta (role:assistant) in nexus_chat con sessionId="forge-test"
- Aspetta la risposta completa
- Valuta la risposta:
  * NATURAL: non contiene **, ·, 🚨, 📊, 📬, 📤, emoji decorative, bullet point
  * DATA: contiene numeri o dati specifici (non "nessun dato disponibile")
  * CORRECT: il routing è andato al Collega giusto

Le domande:

Q1:  "come va la campagna Letture WalkBy ACG?"
     ATTESO: 97 totali, 25 completati, 17 da programmare → CHRONOS

Q2:  "interventi aperti di Marco oggi"
     ATTESO: lista interventi reali con condomini e indirizzi → ARES

Q3:  "dimmi tutto su Condominio De Amicis"
     ATTESO: dossier con dati CRM, impianti, interventi → MEMO

Q4:  "analizza l'ultima mail di Torriglia"
     ATTESO: intent preparare_preventivo, P.IVA 02486680065, Condominio De Amicis → IRIS

Q5:  "quanti RTI sono pronti per fattura?"
     ATTESO: numero GRTIDF con costo compilato, esclusi fatturati → PHARO

Q6:  "esposizione cliente Kristal"
     ATTESO: importo in euro da pagamenti_clienti → CHARTA

Q7:  "manda WA a Dellafiore Lorenzo: domani Kristal ore 14"
     ATTESO: trova numero, conferma invio (dry-run) → ECHO

Q8:  "bozze CRTI vecchie di Lorenzo"
     ATTESO: le 31 bozze >30gg di Dellafiore Lorenzo → PHARO

Q9:  "scadenze CURIT prossimi 90 giorni"
     ATTESO: lista impianti con scadenza → DIKEA

Q10: "chi è Davide Torriglia?"
     ATTESO: contatto, azienda 3i, email, telefono → MEMO

Q11: "report mensile aprile 2026"
     ATTESO: dati aggregati email + interventi + pagamenti → CHARTA

Q12: "quante email senza risposta da più di 48 ore?"
     ATTESO: numero reale → IRIS

Q13: "stato della suite"
     ATTESO: punteggio con dettaglio → PHARO

Q14: "prepara preventivo per De Amicis intestato a 3i"
     ATTESO: avvia workflow preventivo → CALLIOPE/PREVENTIVO

Q15: "agenda di Malvicino domani"
     ATTESO: interventi pianificati → CHRONOS

## Valutazione

Dopo tutti i 15 test:

1. Crea un report results/forge-15-test-reali.html con:
   - Tabella: # | Domanda | Collega | Naturale? | Dati reali? | Risposta (primi 150 char)
   - Conteggio PASS/FAIL
   - Per ogni FAIL: spiegazione del problema

2. Stampa a console il riassunto

3. IMPORTANTE: verifica che TUTTE le 15 domande e risposte siano visibili nella PWA NEXUS sotto sessione "forge-test". Se non appaiono:
   - Verifica che nexusTestInternal scriva in nexus_chat (collection nexo-hub-15f2d)
   - Il sessionId deve essere "forge-test"
   - Ogni messaggio deve avere: sessionId, role (user/assistant), content, createdAt (serverTimestamp)

4. Apri la PWA con Playwright e fai screenshot della sessione forge-test per confermare che i messaggi appaiono

5. Committa con "test(forge): 15 test reali business ACG Clima"
