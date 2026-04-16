Implementa F2 — Thread Detection per IRIS.

1. Aggiungi campo threadId a IrisEmailDoc in Firestore — email della stessa conversazione hanno lo stesso threadId
2. Logica di raggruppamento: confronta Subject (rimuovi "Re:", "Fwd:", "R:", "I:"), mittente/destinatario, e riferimenti In-Reply-To se disponibili nel raw email
3. Nella PWA: le email con stesso threadId si mostrano raggruppate — click su un thread espande tutta la conversazione in ordine cronologico nel pannello di lettura
4. Nel pannello thread mostra timeline con evoluzione sentiment
5. Riesegui pipeline, rideploya PWA, apri nel browser
6. Committa con "feat(iris): F2 thread detection"
