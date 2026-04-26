ARES non trova gli interventi di Federico per data. Il fix è descritto nelle analisi dev-analysis-0YdtBOK9hBqJvYpkrWDd.md e dev-analysis-AQcVigv15fYK4W4gmmzP.md.

Implementa la proposta delle analisi:
1. Query Firestore con filtro data esplicito invece di pescare 200 card a caso
2. Cerca ANCHE gli interventi chiusi (status chiuso/completato), non solo quelli aperti
3. Il campo data in bacheca_cards è "data" o "dataIntervento" — verifica quale è usato
4. Se la data è stringa (DD/MM/YYYY) e non timestamp: converti prima di confrontare

Testa con nexusTestInternal:
- "che interventi aveva Federico giovedì 23/04/2026?" → deve trovare interventi reali
- "interventi di Federico venerdì" → deve trovare interventi del venerdì scorso
- Se non trova interventi per quella data: verificare che bacheca_cards abbia card per Federico in quella data

IMPORTANTE: stampa a console quante card ha Federico in bacheca_cards in totale e quante per la data richiesta. Così capiamo se il problema è il filtro o se davvero non ci sono card.

Deploy + test + email report.
Committa con "fix(ares): query interventi per data reale"
