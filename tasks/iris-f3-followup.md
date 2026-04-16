Implementa F3 — Duplicate / Follow-up Detection per IRIS.

1. Quando arriva un'email, IRIS controlla se nelle ultime 2 settimane ci sono email dallo stesso mittente con subject simile → se sì, marca come "follow_up" con riferimento all'email originale
2. Aggiungi campo isFollowUp: boolean e originalEmailId?: string a IrisEmailDoc
3. Timer: per ogni email con azione suggerita RISPONDI, se dopo 48h non c'è email in uscita verso quel mittente, aggiungi un alert "In attesa di risposta da X giorni"
4. Nella PWA: badge "Sollecito" sulle email follow-up, sezione "In attesa di risposta" nella sidebar
5. Rideploya PWA, apri nel browser
6. Committa con "feat(iris): F3 follow-up detection"
