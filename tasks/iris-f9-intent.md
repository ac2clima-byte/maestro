Implementa F9 — Riconoscimento Intent Multipli per IRIS.

1. Aggiorna il prompt classifier.md: istruisci Haiku che se un'email contiene più richieste diverse, deve elencarle separatamente
2. Aggiungi campo intents: [{category, summary, suggestedAction, entities}][] a EmailClassification — se c'è un solo intent, l'array ha un elemento. Se multipli, più elementi.
3. Il campo principale category/suggestedAction resta quello dell'intent primario (più urgente)
4. Nella PWA: se un'email ha intent multipli, mostra blocchi separati nel pannello lettura, ognuno con la sua categoria e azione
5. Rideploya PWA, apri nel browser
6. Committa con "feat(iris): F9 multi-intent recognition"
