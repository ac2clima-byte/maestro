URGENTE: IRIS ha l'ultima email del 17 aprile. Oggi è il 23. Il polling non funziona. Serve scansione manuale.

1. Esegui la pipeline IRIS per importare le email nuove:
   cd projects/iris/scripts
   python3 pipeline.py

   Se pipeline.py non funziona (credenziali, percorso), prova:
   python3 read_last_emails.py

   Se neanche quello funziona, esegui direttamente con exchangelib:
   python3 -c "
   from exchangelib import Credentials, Account, DELEGATE, Configuration
   creds = Credentials('alberto.contardi@acgclimaservice.com', 'LA_PASSWORD_DAL_ENV')
   config = Configuration(server='remote.gruppobadano.it', credentials=creds)
   account = Account('alberto.contardi@acgclimaservice.com', config=config, autodiscover=False, access_type=DELEGATE)
   for item in account.inbox.filter(is_read=False).order_by('-datetime_received')[:20]:
       print(f'{item.datetime_received} | {item.sender} | {item.subject}')
   "

2. Prendi le credenziali EWS da:
   - projects/iris/.env
   - oppure /mnt/c/HERMES/.env
   - oppure cerca: grep -r "EWS_PASSWORD\|OUTLOOK_PASSWORD" ~/maestro-bridge/ ~/acg_suite/ /mnt/c/HERMES/ 2>/dev/null

3. Importa TUTTE le email dal 17 aprile ad oggi, classificale con Haiku, salvale in iris_emails

4. Verifica che l'email di Torriglia (oggetto: "R: Verifica riscaldamento condominio De Amicis") sia stata importata

5. Stampa a console il numero di email importate

6. Committa con "fix(iris): scansione manuale - importate email 17-23 aprile"
