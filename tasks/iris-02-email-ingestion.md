IRIS Task 2 — Modulo Email Ingestion via EWS

CONTESTO:
Il server Exchange aziendale è on-premise:
- URL: https://remote.gruppobadano.it/ews/exchange.asmx
- Autenticazione: NTLM (username, password, domain)
- TLS: certificato self-signed (per ora accetta, dopo faremo pinning)
- Meccanismo: EWS Pull Subscription + polling ogni 30s
- Libreria: exchangelib (Python, già installato nel sistema - versione 5.6.0)

NOTA IMPORTANTE: dato che exchangelib (Python) è già installato e funzionante nel tuo ambiente, e dato che la libreria ews-javascript-api in Node.js è meno matura, usa Python per il modulo di ingestion email. Crea uno script Python che IRIS (Node.js) chiamerà come subprocess.

TASK:
Lavora dentro projects/iris/. Crea:

1. projects/iris/src/email-ingestion/ews_poller.py — Script Python che:
   - Si connette al server EWS usando exchangelib con NTLM
   - Accetta variabili d'ambiente: EWS_URL, EWS_USERNAME, EWS_PASSWORD, EWS_DOMAIN
   - Disabilita verifica TLS (per ora)
   - Fa una singola query: prende le email non lette degli ultimi 30 secondi dalla Inbox
   - Per ogni email trovata, stampa su stdout un JSON con: message_id, subject, sender, received_time, body_text (primi 2000 caratteri), has_attachments, importance
   - Ogni email è un JSON su una riga (JSON Lines format)
   - Se non ci sono email nuove, non stampa nulla
   - Esce con codice 0

2. projects/iris/src/email-ingestion/EmailIngestion.ts — Classe TypeScript che:
   - Ha un metodo async poll(): Promise<Email[]>
   - Lancia ews_poller.py come subprocess (child_process.spawn con python3)
   - Parsa l'output JSON Lines
   - Ritorna array di oggetti Email tipizzati

3. projects/iris/src/types/email.ts — Interfaccia Email con i campi del punto 1

4. projects/iris/tests/email-ingestion.test.ts — Test con mock del subprocess Python:
   - Test: parsing corretto di una email
   - Test: parsing di email multiple (JSON Lines)
   - Test: nessuna email (output vuoto)
   - Test: errore subprocess (exit code != 0)

5. Committa con "feat(iris): email ingestion module via EWS/exchangelib"

NON testare la connessione al server EWS reale — solo mock nei test.
