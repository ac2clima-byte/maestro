Implementa la funzione vocale nella PWA di IRIS.

CONTESTO:
HERMES ha già STT funzionante in /mnt/c/HERMES/src/. Ma per la PWA usiamo la Web Speech API del browser — è più semplice, funziona su Chrome mobile, non serve backend.

COSA FARE:

1. Aggiungi alla PWA (projects/iris/pwa/index.html) un bottone microfono 🎤 accanto al campo "Dev request" su ogni card email

2. Quando l'utente preme il microfono:
   - Inizia la registrazione vocale via Web Speech API (webkitSpeechRecognition)
   - Il bottone diventa rosso/pulsante per indicare che sta ascoltando
   - La trascrizione appare in tempo reale nel campo di testo
   - Lingua: it-IT

3. Quando l'utente smette di parlare (o preme di nuovo il bottone):
   - La registrazione si ferma
   - Il testo trascritto resta nel campo, pronto per essere inviato con il bottone "Invia richiesta"

4. Gestisci gli errori:
   - Browser non supportato: mostra messaggio "Il tuo browser non supporta la dettatura vocale"
   - Permesso microfono negato: mostra messaggio chiaro
   - Timeout: dopo 30 secondi senza parlato, ferma automaticamente

5. Rideploya su Firebase Hosting

6. Apri nel browser

7. Committa con "feat(iris): voice input via Web Speech API"
