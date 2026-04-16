Crea un file src/utils/slugify.ts con una funzione che:
- Prende una stringa in italiano (con accenti, spazi, caratteri speciali)
- Ritorna uno slug URL-safe (lowercase, trattini al posto degli spazi, no accenti, max 60 caratteri)
- Esporta la funzione come default export

Poi crea un file src/utils/slugify.test.ts che testa:
- "Ciao Mondo" → "ciao-mondo"
- "Città più bella d'Italia" → "citta-piu-bella-ditalia"
- "   spazi   multipli   " → "spazi-multipli"
- Stringa più lunga di 60 caratteri → troncata a 60

Non installare dipendenze. Usa solo Node.js nativo.
Crea la cartella src/utils/ se non esiste.
