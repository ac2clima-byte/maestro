NEXUS non risponde mai all'utente. Il problema: scrive sulla Lavagna ma nessun Collega ascolta e risponde.

FIX: Per v0.1, NEXUS deve rispondere direttamente per le query che può risolvere leggendo Firestore, senza passare dalla Lavagna.

Modifica la Cloud Function proxy di NEXUS (o il codice frontend) così:

1. QUERY DIRETTE (NEXUS risponde subito leggendo Firestore):
   - "quante email urgenti/oggi/totali?" → query iris_emails, conta, rispondi
   - "email da [mittente]?" → query iris_emails where sender contains, mostra risultati
   - "mostra le email senza risposta" → query iris_emails dove followup.needsAttention == true
   - "dimmi tutto su [cliente/condominio]" → per ora rispondi "MEMO non è ancora attivo, ma ecco le email relative:" + query iris_emails
   - "stato della lavagna" → query nexo_lavagna ultimi 10, mostra
   - "quante email per categoria?" → aggregazione iris_emails per categoria

2. AZIONI (scrive sulla Lavagna, dice all'utente che è in attesa):
   - "apri intervento..." → scrivi su Lavagna per ARES + rispondi "Richiesta inviata ad ARES. Quando sarà attivo, gestirà l'intervento."
   - "manda WA a..." → scrivi su Lavagna per ECHO + rispondi "Richiesta inviata a ECHO. Quando sarà attivo, invierà il messaggio."
   - Qualsiasi altra azione → scrivi su Lavagna + rispondi con placeholder

3. Il flusso nella chat deve essere:
   - Utente scrive → bolle typing "NEXUS sta pensando..."
   - Haiku interpreta → decide se è query o azione
   - Se query: leggi Firestore → rispondi con dati reali
   - Se azione: scrivi Lavagna → rispondi con conferma placeholder
   - La risposta appare nella chat entro 3-5 secondi

4. Testa con questi messaggi:
   - "quante email urgenti ho?"
   - "email da Malvicino"
   - "fatture scadute" (placeholder: CHARTA non attivo)
   - "apri intervento caldaia Via Roma" (placeholder: ARES non attivo)

5. Rideploya tutto (Cloud Functions + PWA)
6. Apri nel browser
7. Committa con "fix(nexus): risposte dirette da Firestore per query IRIS"
