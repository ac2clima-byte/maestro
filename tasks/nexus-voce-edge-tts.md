La voce di NEXUS fa schifo (Web Speech API browser). HERMES usava edge-tts con voce Diego ed era molto meglio. Passa a edge-tts.

## Soluzione: Cloud Function che genera audio con edge-tts

1. Crea handler handlers/tts.js (o aggiungi a shared.js):
   - Cloud Function HTTP: nexusTts
   - Riceve: { text: "il testo da leggere" }
   - Chiama edge-tts (pacchetto npm edge-tts o esegui Python edge-tts)
   - Voce: it-IT-DiegoNeural (la stessa di HERMES)
   - Ritorna: audio MP3 (o base64 audio)

2. Se edge-tts non è disponibile come pacchetto npm:
   - Usa il pacchetto Python edge-tts (pip install edge-tts)
   - La Cloud Function esegue un child_process: python3 -c "import edge_tts; ..."
   - Oppure: chiama direttamente l'API Microsoft Edge Read Aloud (è gratuita, non serve chiave API)

3. Alternativa più semplice: usa l'API Microsoft Speech direttamente dal browser
   - L'endpoint edge-tts è: https://speech.platform.bing.com/consumer/speech/synthesize/readaloud
   - Non serve API key — è lo stesso endpoint che usa il browser Edge
   - Implementa la chiamata direttamente nella PWA (JavaScript fetch)

4. Nella PWA:
   - Quando il toggle voce è ON e NEXUS risponde:
     a. Manda il testo alla Cloud Function nexusTts (o chiama l'API direttamente)
     b. Ricevi l'audio MP3
     c. Riproducilo con new Audio(url).play()
   - Mostra indicatore "🔊 sta parlando..." sulla bolla
   - Bottone stop per interrompere la riproduzione

5. Voce: it-IT-DiegoNeural
   Rate: +10% (leggermente più veloce)
   
6. Cache: se lo stesso testo è già stato generato, non rigenerare

7. Deploy functions + hosting
8. Testa: attiva voce, scrivi "ciao come stai" → deve parlare con voce Diego
9. Committa con "feat(nexus): voce edge-tts Diego come HERMES"
