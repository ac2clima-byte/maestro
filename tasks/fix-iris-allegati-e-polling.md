Due problemi critici su IRIS:

## Bug 1: Allegati email non si aprono

Nella pagina IRIS della PWA, le email con allegati mostrano l'icona ma cliccando non succede nulla.

Fix:
1. Verifica come sono salvati gli allegati in iris_emails:
   - Hanno un URL diretto? Un blob base64? Un riferimento a Storage?
   - Se sono salvati come base64: convertili in file scaricabili (blob URL)
   - Se sono URL: verifica che siano accessibili (CORS, auth)

2. Nella PWA, quando l'utente clicca un allegato:
   - Se è un PDF: apri in una nuova tab (window.open)
   - Se è un'immagine: mostra in un modal/lightbox
   - Se è un altro tipo: scarica con download attribute

3. Se gli allegati NON vengono salvati durante il polling IRIS:
   - Aggiorna la pipeline/poller per salvare gli allegati
   - Salvali in Firebase Storage (nexo-hub-15f2d o garbymobile-f89ac)
   - Salva l'URL di download in iris_emails.attachments[]

## Bug 2: IRIS non si aggiorna con le email nuove

L'ultima email è vecchia. Il polling non funziona.

Fix:
1. Verifica se il poller locale (cron WSL) è attivo:
   - crontab -l | grep iris
   - ps aux | grep iris | grep -v grep
   - tail -20 ~/maestro-bridge/logs/iris_poller.log

2. Se il cron non c'è: ricrealo
   - crontab -e → */5 * * * * cd ~/maestro-bridge/projects/iris/scripts && python3 pipeline.py >> ~/maestro-bridge/logs/iris_poller.log 2>&1

3. Se pipeline.py fallisce: stampa l'errore e fixalo

4. Esegui una scansione manuale immediata:
   - cd projects/iris/scripts && python3 pipeline.py
   - Stampa quante email nuove ha importato

5. Verifica che le email nuove appaiano in iris_emails su Firestore

Deploy hosting se serve.
Email report.
Committa con "fix(iris): allegati apribili + polling funzionante"
