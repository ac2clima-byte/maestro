Implementa il polling IRIS 24/7 come Cloud Function schedulata.

1. Crea una Cloud Function "irisPoller" (2nd Gen, region europe-west1) che:
   - Viene invocata ogni 5 minuti da Cloud Scheduler
   - Chiama exchangelib per leggere nuove email da Exchange
   - Per ogni email nuova (non già in iris_emails): classifica con Haiku, salva in Firestore
   - Gestisce watermark: salva l'ultima email processata per non riprocessare
   - Timeout: 120 secondi

2. Le credenziali EWS: leggile da .env o da Firestore cosmina_config/iris_config
   Se non riesci a usare exchangelib dentro una Cloud Function (dipendenza Python),
   usa un approccio alternativo:
   - Cloud Function Node.js che chiama uno script Python locale
   - Oppure: usa node-ews o ews-javascript-api (pacchetto npm per EWS)

3. Deploy: firebase deploy --only functions

4. Verifica che il scheduler sia attivo: firebase functions:list

5. Committa con "feat(iris): polling 24/7 via Cloud Function schedulata"
