Fix UX multipli:

1. NAVIGAZIONE TAB: il tasto Tab della tastiera deve spostare il focus tra i Colleghi nella sidebar. Frecce su/giù per navigare, Enter per selezionare. Focus visibile con bordo.

2. ESC CHIUDE NEXUS: premere Escape quando la chat NEXUS è aperta deve chiuderla. document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiNexusChat(); })

3. IRIS ARCHIVIA: il bottone "Archivia" non è visibile nella lista email IRIS. Verifica che esista, se no aggiungilo:
   - Ogni riga email deve avere un bottone piccolo "📁" a destra
   - Click → segna come archived in Firestore iris_emails
   - La riga diventa grigia o scompare
   - Anche lo swipe a destra deve funzionare su mobile

4. STOP VOCE: quando NEXUS sta parlando (TTS), deve esserci un modo per interromperlo:
   - Bottone "⏹" visibile durante la riproduzione vocale
   - Click → speechSynthesis.cancel() ferma la voce immediatamente
   - Anche cliccando ovunque nella chat si interrompe
   - Anche premendo un tasto qualsiasi si interrompe

Testa tutto con Playwright. Deploy hosting.
Committa con "fix(ux): tab navigation, ESC close, archivio IRIS, stop voce"
