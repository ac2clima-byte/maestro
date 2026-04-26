I test FORGE precedenti erano troppo permissivi. 11/15 PASS era falso — il voto reale è 2/15.

Questo task ha DUE parti: prima fixa i problemi, poi ritesta con criteri severi.

REGOLA DI SICUREZZA ASSOLUTA: nei test NON mandare MAI WA, email, o messaggi a NESSUNO. Tutti i test con ECHO devono essere in DRY_RUN forzato. Il test Q7 deve verificare che il dry-run sia attivo, non mandare il messaggio.

## PARTE 1 — FIX (in ordine di priorità)

### Fix 1: Routing Haiku
Nel system prompt di Haiku (handlers/nexus.js), aggiungi esempi espliciti di routing:
- "campagna" / "come va la campagna" → CHRONOS (NON delphi)
- "RTI" / "RTIDF" / "pronti per fattura" / "bozze RTI" / "bozze CRTI" → PHARO (NON charta, NON memo)
- "preventivo" / "prepara preventivo" → collega: "orchestrator"
- "interventi aperti di [tecnico]" → ARES con filtro tecnico

### Fix 2: MEMO dossier completo
In handlers/memo.js, handleMemoDossier:
- Quando trova UN match chiaro (es. "Condominio De Amicis" match unico): NON dare lista, dai il DOSSIER completo
- Il dossier deve includere: nome, codice, indirizzo, impianti (tipo, marca, potenza), ultimi 5 interventi (data, tipo, tecnico), amministratore, email recenti da IRIS, esposizione da CHARTA
- Se trova più match: mostra la lista MA chiedi "quale intendi?"
- Se trova 0 match: "Non trovo nessun condominio con quel nome nel CRM"

### Fix 3: ARES interventi per tecnico
In handlers/ares.js, handleAresInterventiAperti:
- Quando la domanda contiene un nome tecnico ("di Marco", "di Malvicino"):
  - Filtra gli interventi per quel tecnico
  - Se non trova: "Marco non ha interventi programmati per oggi" (NON "nessun intervento programmato" generico)
- Leggi da COSMINA bacheca_cards con filtro tecnico + data

### Fix 4: PHARO — RTI pronti per fattura e bozze CRTI
In handlers/pharo.js, aggiungi handler:
- handlePharoRtiProntiFattura: conta GRTIDF con costo compilato, fatturabile=true, escludi fatturati. Ritorna numero + valore EUR
- handlePharoBozzeCrtiPerTecnico: cerca bozze CRTI vecchie (>30gg) filtrate per tecnico. Per "Lorenzo" → filtra Dellafiore Lorenzo → deve trovare le 31 bozze

### Fix 5: MEMO chi è [persona]
In handlers/memo.js:
- "chi è Davide Torriglia?" → cerca in rubrica contatti interni (cosmina_contatti_interni) + in iris_emails + in memo_aziende
- Ritorna: nome, azienda, telefono, email, ultima email scambiata, relazione con ACG

### Fix 6: Stato suite punteggio
In handlers/pharo.js, handlePharoStatoSuite:
- Il punteggio 0/100 con 100 pending in lavagna è un falso allarme
- I messaggi di test FORGE sulla lavagna non devono contare come "problemi"
- Filtra via i messaggi con sessionId="forge-test" o tipo="test"

### Fix 7: Report mensile
In handlers/charta.js, handleChartaReportMensile:
- Deve parsificare mesi in italiano: "aprile" → "2026-04", "marzo" → "2026-03"
- Se non specificato il mese, usa il mese corrente
- Includere dati da: iris_emails (volume email per categoria) + pagamenti_clienti (esposizione) + bacheca_cards (interventi)

## PARTE 2 — RITESTA con criteri severi

Dopo i fix, riesegui i 15 test con criteri di accettazione PRECISI:

Q1: "come va la campagna Letture WalkBy ACG?"
    ROUTING: chronos
    ACCETTAZIONE: la risposta DEVE contenere il numero 97 (totale) e 25 (completati)
    FAIL se: routing sbagliato OPPURE non contiene 97 OPPURE non contiene 25

Q2: "interventi aperti di Marco oggi"
    ROUTING: ares
    ACCETTAZIONE: la risposta deve contenere "Marco" e almeno un indirizzo di condominio, OPPURE "Marco non ha interventi oggi" (ma deve aver cercato davvero)
    FAIL se: risposta generica senza menzionare Marco

Q3: "dimmi tutto su Condominio De Amicis"
    ROUTING: memo
    ACCETTAZIONE: la risposta deve contenere ALMENO 3 di questi: indirizzo, codice impianto, tipo impianto, ultimo intervento, amministratore
    FAIL se: dà solo una lista di match senza dettagli

Q4: "analizza l'ultima mail di Torriglia"
    ROUTING: iris
    ACCETTAZIONE: deve contenere "3i efficientamento" E "02486680065" E "De Amicis" E "preventivo"
    FAIL se: manca uno di questi dati

Q5: "quanti RTI sono pronti per fattura?"
    ROUTING: pharo
    ACCETTAZIONE: deve contenere un NUMERO di RTI e un importo in EURO
    FAIL se: routing sbagliato OPPURE non contiene numeri

Q6: "esposizione cliente Kristal"
    ROUTING: charta
    ACCETTAZIONE: deve contenere un importo in euro (es. 1652)
    FAIL se: non contiene importo

Q7: "manda WA a Dellafiore Lorenzo: domani Kristal ore 14"
    ROUTING: echo
    ACCETTAZIONE: deve dire che è in dry-run E deve aver trovato il numero di Lorenzo
    FAIL se: manda davvero il messaggio OPPURE non trova Lorenzo
    SICUREZZA: verificare che NON sia stato inviato nessun WA reale

Q8: "bozze CRTI vecchie di Lorenzo"
    ROUTING: pharo
    ACCETTAZIONE: deve contenere un numero di bozze (circa 31) E "Dellafiore"
    FAIL se: "non trovo nulla" OPPURE routing a memo

Q9: "scadenze CURIT prossimi 90 giorni"
    ROUTING: dikea
    ACCETTAZIONE: deve contenere date di scadenza reali
    FAIL se: "nessuna scadenza" quando ce ne sono

Q10: "chi è Davide Torriglia?"
     ROUTING: memo
     ACCETTAZIONE: deve contenere "3i efficientamento" E ("347" O email torriglia)
     FAIL se: dà solo info dalle email senza contatti

Q11: "report mensile aprile 2026"
     ROUTING: charta
     ACCETTAZIONE: deve contenere dati numerici (email, interventi, importi) per aprile
     FAIL se: "formato mese non valido" OPPURE dati generici non specifici ad aprile

Q12: "quante email senza risposta da più di 48 ore?"
     ROUTING: iris
     ACCETTAZIONE: deve contenere un numero
     FAIL se: risposta vaga senza numero

Q13: "stato della suite"
     ROUTING: pharo
     ACCETTAZIONE: punteggio > 0 E dettaglio componenti
     FAIL se: punteggio 0/100 per falsi positivi

Q14: "prepara preventivo per De Amicis intestato a 3i"
     ROUTING: orchestrator o preventivo
     ACCETTAZIONE: deve avviare il workflow preventivo (menzionare bozza, o chiedere conferma)
     FAIL se: routing a "nessuno"

Q15: "agenda di Malvicino domani"
     ROUTING: chronos
     ACCETTAZIONE: deve menzionare "Malvicino" E dare interventi o "nessun intervento pianificato"
     FAIL se: risposta generica senza menzionare Malvicino

## Formato valutazione

Per ogni test stampa:
```
Q1: "come va la campagna Letture WalkBy ACG?"
ROUTING: chronos → [effettivo] → OK/FAIL
NATURAL: OK/FAIL (no emoji, no bold, no bullet)
DATA: OK/FAIL (contiene 97 e 25? sì/no)
VERDICT: PASS/FAIL
RISPOSTA: [primi 200 char]
```

## Report finale

Crea results/forge-15-severi.html con:
- Conteggio reale PASS/FAIL
- Per ogni FAIL: esattamente cosa manca
- Confronto prima/dopo i fix

Scrivi TUTTI i messaggi in nexus_chat sessione "forge-test-v2" (NON sovrascrivere forge-test).

Deploy functions + hosting PRIMA di testare.
Committa con "fix+test(forge): 7 fix + 15 test con criteri severi"
