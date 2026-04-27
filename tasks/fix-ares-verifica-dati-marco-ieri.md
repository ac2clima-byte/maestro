Alberto segnala 2 problemi sugli interventi di Marco ieri (26/04/2026):

## Problema 1: Card duplicata — quale e perché?
NEXUS dice "1 card raggruppata come duplicato" ma non spiega QUALE card è stata raggruppata.
- Verifica: quali sono le 4 card originali di Marco del 26/04?
- Stampa per ognuna: id, name, boardName, listName, workDescription, workHours, due, status, originalBoardId
- Spiega quale è stata raggruppata e perché

## Problema 2: Condominio Cappuccini — che intervento è?
Alberto dice "Cappuccini non è andato". 
- Verifica la card Cappuccini: è stato aperto? Da chi? Che listName ha?
- Se la card è in una lista tipo "RITORNO NON URGENTE" o "DA FARE" ma NON è stata eseguita ieri, NON dovrebbe apparire come "intervento di ieri"
- Il filtro deve distinguere:
  - Card ESEGUITE ieri (chiuse ieri, o con workDescription compilata) 
  - Card PROGRAMMATE per ieri ma non eseguite (aperte, senza rapporto)
  - Card in liste speciali (RITORNO, DA FARE) che hanno due=ieri ma non sono interventi veri

## Fix nel render
Quando NEXUS mostra gli interventi, deve dire:
- "CONDOMINIO CAPPUCCINI — ritorno programmato, non ancora eseguito (stato aperto)" se è un ritorno
- Oppure non mostrarlo se non è stato eseguito

## Verifica dati
Esegui query Firestore su bacheca_cards per Marco, due=26/04/2026:
```
const cards = await cosminaDb.collection('bacheca_cards')
  .where('techName', '==', 'MARCO')
  .get();
// filtra per due nel range 26/04
// stampa: id, name, boardName, listName, workDescription, workHours, status, due
```

Stampa TUTTI i risultati a console prima di qualsiasi fix.

Deploy + test + email report con i dati verificati.
Committa con "fix(ares): verifica e correggi dati Marco ieri"
