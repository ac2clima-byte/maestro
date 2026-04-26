PROBLEMA GRAVE: NEXUS non sa navigare le email. Ripete sempre "Hai 2 email di oggi" e non mostra le altre.

Quando Alberto dice:
- "guarda le mail" → mostra TUTTE le email recenti (ultime 10), non solo il conteggio
- "guarda le altre" → mostra le successive
- "leggi la seconda" → mostra il contenuto della seconda email
- "mail di oggi" → filtra per oggi
- "mail di Torriglia" → filtra per mittente
- "mail urgenti" → filtra per non risposte >48h

## Fix in handlers/iris.js

### 1. handleEmailRecenti (nuovo handler o fix esistente)
Quando Alberto chiede di vedere le email, NON rispondere solo con il conteggio. Mostra la lista:

```
Hai 15 email recenti. Ecco le ultime 5:

1. Da Davide Torriglia (23/04) — R: Verifica riscaldamento De Amicis
   Ha risposto con la P.IVA di 3i efficientamento. Serve il preventivo.

2. Da Giulio Dilorenzo (22/04) — Richiesta manutenzione Via Roma
   Chiede intervento caldaia, segnala perdita acqua.

3. Da Sara Poggi (22/04) — Fattura n.123 Cambielli
   Fattura fornitore da registrare, €1.234.

4. Da Studio Rossi (21/04) — Convocazione assemblea Kristal
   Assemblea il 15 maggio, richiesta preventivo manutenzione.

5. Da CURIT (20/04) — Scadenza dichiarazione F-Gas
   Scadenza il 30 aprile per 3 impianti.

Vuoi che ne apra una? Dimmi il numero.
```

### 2. handleEmailLeggi (nuovo handler)
Quando Alberto dice "leggi la 2" o "apri la seconda" o "dimmi di più sulla mail di Dilorenzo":
- Mostra il CONTENUTO completo dell'email
- Mostra gli allegati se ci sono
- Proponi azioni: "Vuoi che risponda? Che la archivi? Che apra un intervento?"

### 3. handleEmailAltre (fix)
"guarda le altre" / "le successive" / "avanti":
- Mostra le 5 successive (paginazione)
- Se non ce ne sono: "Non ci sono altre email."

### 4. Il routing Haiku deve capire
- "guarda le mail" → iris/email_recenti (NON iris/email_totali)
- "guarda le altre" → iris/email_successive (NON chiarimento)
- "leggi la seconda" → iris/leggi_email con parametro indice=2
- "no guarda le altre" → iris/email_successive (NON fermarti)

### 5. Context: ricordare l'ultima lista
Quando NEXUS mostra una lista di email, salva in sessione (nexus_chat o pending) l'array degli emailId mostrati. Così quando Alberto dice "la seconda", sa quale email aprire.

## Test con nexusTestInternal

1. "guarda le mail" → deve mostrare lista di 5 email con mittente, data, oggetto, riassunto
2. "leggi la prima" → deve mostrare contenuto email
3. "guarda le altre" → deve mostrare le 5 successive
4. "mail di Torriglia" → deve filtrare per Torriglia

Deploy + test + email report.
Committa con "fix(iris): navigazione email completa in chat"
