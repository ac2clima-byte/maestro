Implementa F3 — Duplicate / Follow-up Detection per IRIS.

COSA FARE:

1. Crea projects/iris/scripts/followup_detector.py:
   - Analizza le email in Firestore e rileva:
     a. Solleciti: email dove il mittente scrive di nuovo sullo stesso argomento dopo non aver ricevuto risposta
     b. Email senza risposta: richieste ricevute a cui non è stata inviata nessuna email in uscita verso quel mittente entro 48 ore
   - Per ogni email calcola: has_followup (bool), days_without_reply (int), is_followup_of (id dell'email originale)

2. Aggiorna projects/iris/src/types/firestore.ts:
   - Aggiungi a IrisEmailDoc: followup?: { isFollowup: bool, originalEmailId?: string, daysWithoutReply?: number, needsAttention: bool }

3. Aggiorna la pipeline per eseguire il followup detection dopo i thread

4. Aggiorna la PWA:
   - Badge "⏰ In attesa da X giorni" sulle email senza risposta
   - Badge "🔄 Sollecito" sulle email che sono follow-up di una precedente
   - Link cliccabile all'email originale quando è un sollecito
   - Nella sezione stats in alto: contatore "X email senza risposta"

5. Riesegui pipeline sulle 30 email

6. Rideploya PWA

7. Apri nel browser

8. Committa con "feat(iris): F3 follow-up detection"
