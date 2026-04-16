Modifica projects/iris/pwa/index.html:

1. Disabilita temporaneamente il login — la dashboard deve caricarsi direttamente con i dati mock, senza richiedere autenticazione. Commenta o bypassa la logica di auth, non cancellarla (servirà dopo).

2. Apri la pagina nel browser con cmd.exe /c start per verificare che si veda la dashboard con i dati mock.

3. Dopo aver verificato che funziona, deploya su Firebase Hosting:
   - Vai nella cartella projects/iris/
   - Se non esiste firebase.json, crealo con hosting configurato su pwa/ come public directory
   - Esegui: firebase login --no-localhost (se non sei già loggato)
   - Esegui: firebase use nexo-hub-15f2d
   - Esegui: firebase deploy --only hosting
   - L'URL finale sarà: https://nexo-hub-15f2d.web.app

4. Se il deploy va a buon fine, apri https://nexo-hub-15f2d.web.app nel browser con cmd.exe /c start

5. Committa con "feat(iris): PWA deployed on Firebase Hosting"
