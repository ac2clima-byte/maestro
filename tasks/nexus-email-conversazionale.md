NEXUS quando mostra le email è troppo meccanica. Deve essere conversazionale come un assistente umano.

## Comportamento attuale (SBAGLIATO):
"Hai 3 email urgenti:
1. [10/04] Giulio Dilorenzo — R: Notificazione ai sensi della legge n. 53 del 1994
2. [16/04] Moraschi Roberto — R: Complesso immobiliare..."
→ Muro di testo incomprensibile, soprattutto se letto a voce.

## Comportamento voluto (CORRETTO):

### Quando Alberto chiede "email urgenti" o "cosa c'è di nuovo":
NEXUS risponde breve e naturale:
"Hai 3 email nuove. La prima è da Giulio Dilorenzo, riguarda una notificazione legale. Vuoi che te la legga?"

Alberto: "sì"

NEXUS: "Dilorenzo ti scrive riguardo una notifica ai sensi della legge 53 del 1994. In pratica [riassunto in 2 frasi del contenuto]. Vuoi passare alla prossima?"

Alberto: "sì" 

NEXUS: "La seconda è da Moraschi Roberto, un'offerta per il complesso immobiliare. Vuoi i dettagli?"

### Quando Alberto chiede "analizza l'ultima mail di Torriglia":
NEXUS: "L'ultima email di Torriglia è una risposta alla tua richiesta di intestazione per il preventivo del Condominio De Amicis. Ti ha dato la ragione sociale: 3i efficientamento energetico, P.IVA 02486680065. Vuoi che prepari il preventivo?"

## Implementazione in handlers/nexus.js e handlers/iris.js:

1. Modifica il prompt di Haiku per le risposte email:
   - PRIMA: ritorna lista tecnica di email
   - ORA: ritorna riassunto conversazionale, una email alla volta
   - Il prompt deve dire: "Rispondi come un assistente umano che parla con il suo capo. Breve, naturale, vai al punto. Non fare elenchi tecnici. Presenta una email alla volta e chiedi se vuole approfondire."

2. Mantieni lo stato della conversazione:
   - Se Alberto dice "sì" o "prossima" → mostra la prossima email
   - Se dice "no" o "basta" → fermati
   - Se dice "leggila tutta" → mostra il corpo completo (riassunto, non copia)
   - Se dice "rispondi" → attiva CALLIOPE per la bozza

3. Il riassunto deve essere:
   - Chi scrive e perché (1 frase)
   - Cosa serve fare (1 frase)
   - Mai il corpo completo dell'email al primo passaggio
   - Mai elenchi puntati
   - Mai date in formato tecnico [DD/MM]

4. Quando letto a voce (TTS attivo), il testo deve suonare naturale parlato, non letto da un database.

Rideploya functions.
Committa con "feat(nexus): presentazione email conversazionale"
