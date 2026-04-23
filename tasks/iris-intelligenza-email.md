IRIS deve capire il SIGNIFICATO reale di un'email, non solo classificarla.

PROBLEMA: una email arriva con "Buongiorno Alberto" + firma aziendale + disclaimer GDPR + footer. Nessun contenuto reale. IRIS deve capire che è una RISPOSTA VUOTA e segnalarla come "follow-up necessario — risposta senza contenuto".

COSA IMPLEMENTARE nel classificatore Haiku (prompts/classifier.md o dove si trova il system prompt):

1. Aggiungi al prompt di classificazione questi campi di output:
   - contenuto_reale: string — il testo EFFETTIVO dell'email dopo aver rimosso firme, disclaimer, footer, testo quotato, saluti standard. Se dopo la pulizia resta vuoto → "NESSUNO"
   - risposta_vuota: boolean — true se l'email è una risposta (RE: / R:) senza contenuto sostanziale
   - azione_suggerita: string — cosa dovrebbe fare Alberto? "rispondere", "archiviare", "attendere", "follow-up necessario", "nessuna azione"

2. Pattern da riconoscere come "risposta vuota":
   - Solo saluto ("Buongiorno", "Salve", "Ciao") + firma
   - Solo "ok", "ricevuto", "grazie" + firma
   - Solo firma senza testo
   - Risposta con solo testo quotato e nessun nuovo contenuto
   - Email con solo disclaimer legale / GDPR / privacy

3. Pattern da riconoscere come "email automatica":
   - Out of office
   - Conferma di lettura
   - Notifica di mancato recapito
   - Newsletter con solo link "Iscriviti" / "Leggi di più"

4. Quando IRIS classifica una email come risposta_vuota=true:
   - Categoria: quella corretta (RISPOSTA_CLIENTE, OFFERTA_FORNITORE, ecc.)
   - Ma aggiunge flag: risposta_vuota=true
   - E azione_suggerita: "follow-up necessario — la risposta non contiene informazioni utili"
   - Se il thread è collegato a una richiesta di Alberto: segnala come urgente

5. Nella PWA: le email con risposta_vuota=true devono avere un badge rosso "⚠️ Risposta vuota"

6. In NEXUS Chat: quando Alberto chiede "email senza risposta", includere anche le risposte vuote (perché non sono vere risposte)

7. Aggiorna il classificatore, rideploya, testa con l'email di Torriglia.

8. Committa con "feat(iris): rilevamento risposte vuote e email senza contenuto"
