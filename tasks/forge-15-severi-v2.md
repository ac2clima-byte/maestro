Riesegui i 15 test FORGE con criteri severi. Dopo i test, manda il report via email a ac2clima@gmail.com.

REGOLA SICUREZZA: NON mandare WA, email, o messaggi a NESSUNO durante i test. Solo dry-run.

## Pre-check

1. Verifica che nexusTestInternal sia deployato e funzionante:
   curl -s -X POST https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal \
     -H "Content-Type: application/json" \
     -d '{"message":"ciao","forgeKey":"nexo-forge-2026"}'
   Se errore → fixa e rideploya prima di procedere.

## Esegui i 15 test

Per ogni test: chiama nexusTestInternal, scrivi domanda+risposta in nexus_chat sessione "forge-test-v2".

Q1:  "come va la campagna Letture WalkBy ACG?"
     PASS se: routing=chronos E risposta contiene "97" E "25"

Q2:  "interventi aperti di Marco oggi"
     PASS se: routing=ares E risposta menziona "Marco" E contiene almeno un condominio/indirizzo O dice "Marco non ha interventi oggi"

Q3:  "dimmi tutto su Condominio De Amicis"
     PASS se: routing=memo E risposta contiene ALMENO 3 di: indirizzo, impianto, intervento, amministratore, codice

Q4:  "analizza l'ultima mail di Torriglia"
     PASS se: routing=iris E risposta contiene "3i efficientamento" E "02486680065" E "De Amicis"

Q5:  "quanti RTI sono pronti per fattura?"
     PASS se: routing=pharo E risposta contiene un NUMERO di RTI e un importo in EURO

Q6:  "esposizione cliente Kristal"
     PASS se: routing=charta E risposta contiene un importo in euro

Q7:  "manda WA a Dellafiore Lorenzo: domani Kristal ore 14"
     PASS se: routing=echo E risposta dice dry-run/simulato E trova il numero di Lorenzo
     SICUREZZA: verificare che NON sia stato inviato WA reale

Q8:  "bozze CRTI vecchie di Lorenzo"
     PASS se: routing=pharo E risposta contiene un numero di bozze E "Dellafiore"

Q9:  "scadenze CURIT prossimi 90 giorni"
     PASS se: routing=dikea E risposta contiene date di scadenza reali

Q10: "chi è Davide Torriglia?"
     PASS se: routing=memo E risposta contiene "3i efficientamento" E contatto (telefono o email)

Q11: "report mensile aprile 2026"
     PASS se: routing=charta E risposta contiene dati numerici per aprile E NON dice "formato non valido"

Q12: "quante email senza risposta da più di 48 ore?"
     PASS se: routing=iris E risposta contiene un numero

Q13: "stato della suite"
     PASS se: routing=pharo E punteggio > 0 (non 0/100 per falsi positivi)

Q14: "prepara preventivo per De Amicis intestato a 3i"
     PASS se: routing=orchestrator/preventivo E avvia workflow o chiede conferma

Q15: "agenda di Marco domani"
     PASS se: routing=chronos E risposta menziona "Marco" E dà interventi o "nessun intervento"

PER OGNI TEST verificare anche:
- NATURAL: niente **, ·, emoji decorative, bullet point
- Se FAIL: spiegare ESATTAMENTE cosa manca

## Report

Crea results/forge-15-severi-v2.html con tabella dettagliata.

## Manda email report

Alla fine dei 15 test, manda email:
curl -X POST https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoSendReport \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ac2clima@gmail.com",
    "subject": "NEXO FORGE: 15 test severi v2 - [X]/15 PASS",
    "body": "[tabella risultati con PASS/FAIL per ogni test e motivo del FAIL]",
    "forgeKey": "nexo-forge-2026"
  }'

Committa con "test(forge): 15 test severi v2 con report email"
