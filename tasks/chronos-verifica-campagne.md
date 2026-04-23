Verifica che i numeri delle campagne su NEXO corrispondano a COSMINA.

1. Per OGNI campagna attiva, confronta i numeri NEXO vs COSMINA:
   - Query diretta su Firestore garbymobile-f89ac per contare le bacheca_cards di ogni campagna
   - Confronta con i numeri che ritorna handleChronosCampagne

2. Campagne da verificare:
   - "Letture WalkBy ACG FS 2026" → Alberto vede 97 totali su COSMINA, NEXO ne conta 13. Perché?
   - "Letture WalkBy GZT FS 2026"
   - "SPEGNIMENTO 2026" — appena corretto, verifica che sia allineato
   - "RIEMPIMENTI 2026"
   - Tutte le altre

3. Se i numeri non corrispondono:
   - Stampa a console la query usata e il numero di risultati
   - Verifica il campo campagna_id o campagna_nome usato per filtrare
   - Potrebbe essere che bacheca_cards usa un campo diverso per l'appartenenza alla campagna
   - Oppure la campagna ha più ID (duplicati)

4. Correggi il filtro fino a che i numeri corrispondono a COSMINA

5. Testa via NEXUS: "come va la campagna Letture WalkBy ACG?"
   - Il numero totale deve essere 97 (o il numero corretto su COSMINA adesso)

6. Rideploya functions + hosting
7. Committa con "fix(chronos): numeri campagne allineati a COSMINA"
