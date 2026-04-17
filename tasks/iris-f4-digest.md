Implementa F4 — Smart Digest per IRIS.

Aggiungi alla PWA (projects/iris/pwa/index.html) una sezione "Digest" in cima alla dashboard:

1. Card speciale in cima che mostra un riassunto generato:
   - "Oggi X email. Y urgenti. Z senza risposta da più di 48h."
   - Top 3 email per priorità con riassunto di una riga ciascuna
   - Ultimo aggiornamento: timestamp

2. Il digest viene calcolato lato client leggendo le email da Firestore e aggregando i dati.

3. Stile: card con bordo sinistro colorato (blu), sfondo leggermente diverso dalle email normali, icona 📋

Rideploya su Firebase Hosting. Apri nel browser.
Committa con "feat(iris): F4 smart digest"
