Implementa F5 — Mappa Relazioni Mittenti per IRIS.

1. Crea collection nexo-hub Firestore: iris_senders/{email} con: nome, email, totale email, ultima email, frequenza media, categorie più comuni, condomini associati, sentiment medio
2. Aggiorna automaticamente il profilo mittente a ogni email classificata
3. Nella PWA: quando selezioni un'email, il pannello lettura mostra mini-scheda mittente con stats
4. Nella sidebar: sezione "Mittenti frequenti" con top 10
5. Rideploya PWA, apri nel browser
6. Committa con "feat(iris): F5 sender profiles"
