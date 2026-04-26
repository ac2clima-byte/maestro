Implementa i tasti ARCHIVIA e ELIMINA nella pagina IRIS, come descritto in tasks/dev-analysis-KbAuca5msDQaw0rD01ic.md. Segui l'analisi.

1. Frontend IRIS (projects/nexo-pwa/public/iris/index.html):
   - Aggiungi bottone "📦 Archivia" e "🗑️ Elimina" in ogni card email
   - Click Archivia → chiama irisArchiveEmail (già esistente) → email scompare o diventa grigia
   - Click Elimina → conferma "Sei sicuro?" → chiama nuovo endpoint irisDeleteEmail → email scompare

2. Backend Elimina (handlers/iris.js):
   - Nuovo handler handleIrisDeleteEmail: segna email come deleted in iris_emails (status="deleted")
   - NON cancellare il documento da Firestore — solo flag status="deleted"
   - Esporta in index.js come irisDeleteEmail (HTTP POST, autenticato)

3. Frontend wrapper (js/app.js):
   - Estrai archiveEmail(emailId) come funzione riusabile
   - Aggiungi deleteEmail(emailId)
   - Aggiungi IRIS_DELETE_URL

4. CSS: bottone Archivia in blu, bottone Elimina in rosso (piccoli, non invasivi)

5. Firestore rules: aggiungi irisDeleteEmail nelle rules se serve

6. Deploy functions + hosting

7. Testa con Playwright:
   - Apri pagina IRIS
   - Verifica che i bottoni appaiano su ogni card
   - Click Archivia su una email → verifica status=archived in Firestore
   - Click Elimina su una email → verifica conferma + status=deleted

8. Committa con "feat(iris): tasti Archivia e Elimina per ogni email"
