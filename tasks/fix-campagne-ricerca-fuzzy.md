Due problemi con le campagne:

1. La ricerca non trova "Letture WalkBy" perché la campagna si chiama "Letture ACG FS 2026" (senza "WalkBy"). La ricerca deve essere FUZZY: se Alberto dice "WalkBy" o "Letture ACG" o "letture walkby acg" deve trovare la campagna giusta. Match parziale, case insensitive.

2. Nella lista c'è "POSTELEGRAFONICI - CAMBIO CONTATORI" — verifica se è una campagna reale o un dato sporco. Alberto non la riconosce.

Fix in handlers/chronos.js:
- Ricerca fuzzy: splitta la query in parole, cerca ogni parola nel nome campagna
- "Letture WalkBy" → cerca "letture" → trova "Letture ACG FS 2026" e "Letture GZT FS 2026"
- Se più match: mostrali tutti e chiedi quale
- Se un match solo: mostra direttamente i dati

Committa con "fix(chronos): ricerca campagne fuzzy"
