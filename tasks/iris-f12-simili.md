Implementa F12 — Comparazione Email Simili Storiche per IRIS.

1. Quando IRIS classifica un'email, cerca in Firestore email con stessa categoria + stesso mittente (o stesso condominio) negli ultimi 6 mesi
2. Se trova match, aggiunge campo similarEmails: [{emailId, date, summary, howHandled}] al documento
3. howHandled = come è stata gestita l'email simile (tempo di risposta, azione presa, se è stata corretta)
4. Nella PWA: sezione "Casi simili" nel pannello lettura con le email storiche trovate. Click per vedere il dettaglio.
5. Rideploya PWA, apri nel browser
6. Committa con "feat(iris): F12 similar email comparison"
