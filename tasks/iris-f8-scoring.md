Implementa F8 — Email Scoring e Priorità Dinamica per IRIS.

1. Aggiungi campo score: number (0-100) a IrisEmailDoc
2. Calcola lo score basandoti su: categoria (urgente=+30), sentiment (arrabbiato=+20), tempo senza risposta (+5 per ogni 24h), isFollowUp (+15), has_attachments (+5), importo estratto > 1000€ (+10)
3. Aggiorna lo score periodicamente (ogni volta che la pipeline gira)
4. Nella PWA: mostra score come numero piccolo sulla card. Default ordine: cronologico. Aggiungi toggle "Ordina per priorità" nella toolbar
5. Rideploya PWA, apri nel browser
6. Committa con "feat(iris): F8 email scoring"
