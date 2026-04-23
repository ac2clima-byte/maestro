Implementa il flusso completo: registrazione telefonata → trascrizione → analisi → azioni proposte.

## 1. Upload audio nella chat NEXUS

In projects/nexo-pwa/public/index.html:
1. Aggiungi bottone 📞 nella barra input di NEXUS Chat (accanto al microfono e invio)
2. Click → apre file picker per audio (accept="audio/*")
3. Anche: supporta "Condividi" da altre app (Web Share Target API nel manifest.json)
4. Quando l'utente seleziona un file audio:
   - Mostra bolla utente: "📞 Registrazione chiamata (2:34)" con player audio inline
   - Upload il file a Firebase Storage (nexo-hub-15f2d.appspot.com/call_recordings/{timestamp}.webm)
   - Chiama Cloud Function per trascrizione

## 2. Cloud Function: nexoTranscribeCall (HTTP POST)

In handlers/calls.js:
1. Riceve l'URL del file audio da Firebase Storage
2. Scarica il file
3. Chiama Whisper API (OpenAI) per trascrizione:
   - POST https://api.openai.com/v1/audio/transcriptions
   - model: whisper-1
   - language: it
   - response_format: text
4. Salva la trascrizione in Firestore nexus_call_transcripts:
   {
     id, audioUrl, trascrizione, durata,
     timestamp, analizzato: false
   }
5. Chiama Haiku per analisi intent sulla trascrizione (stesso prompt di IRIS ma per conversazioni telefoniche):
   {
     "persone_menzionate": ["Torriglia"],
     "aziende": ["3i efficientamento"],
     "argomenti": ["preventivo verifica riscaldamento", "budget 3000€", "sopralluogo"],
     "azioni_da_fare": [
       "Preparare preventivo entro venerdì",
       "Pianificare sopralluogo al De Amicis"
     ],
     "urgenza": "media",
     "riassunto": "Torriglia conferma budget max 3000€ per verifica riscaldamento De Amicis. Vuole preventivo entro venerdì. Serve sopralluogo prima."
   }
6. Aggiorna nexus_call_transcripts con i risultati dell'analisi
7. Manda push notification ad Alberto: "📞 Chiamata analizzata. 2 azioni da fare."
8. Ritorna risultato alla chat

## 3. Visualizzazione in NEXUS Chat

Dopo la trascrizione, NEXUS mostra nella chat:
```
📞 Trascrizione chiamata (2:34)

Riassunto: Torriglia conferma budget max 3000€ per 
verifica riscaldamento De Amicis. Vuole preventivo 
entro venerdì. Serve sopralluogo prima.

Azioni proposte:
1. 📝 Preparare preventivo entro venerdì → CALLIOPE
2. 📅 Pianificare sopralluogo De Amicis → CHRONOS

Vuoi che proceda? (Sì a tutto / Scegli / Modifica)
```

Bottoni cliccabili per ogni azione. Click su "Sì a tutto" → avvia i workflow.

## 4. API key OpenAI per Whisper

- Salva in Secret Manager: OPENAI_API_KEY
- Se non vuoi usare OpenAI, alternativa: Whisper locale su Hetzner (già usato da HERMES)
  - Crea endpoint su Hetzner: POST /transcribe che accetta audio e ritorna testo
  - Il server Hetzner ha già Whisper installato per HERMES

Prova prima con l'endpoint Hetzner (gratuito). Se non funziona, usa OpenAI API.

Cerca in /mnt/c/HERMES/ come HERMES usa Whisper:
grep -r "whisper\|transcri" /mnt/c/HERMES/ --include="*.js" --include="*.py" | head -20

## 5. Android: istruzioni Tasker

Crea un file docs/tasker-setup.md con:
- Istruzioni passo-passo per configurare Tasker su Android
- Profilo: "Evento → Telefono → Fine chiamata"
- Task: "Notifica → Manda a NEXUS? → Se tap → Apri URL https://nexo-hub-15f2d.web.app?share_audio=last"
- Screenshot dei passaggi (descrittivi, non reali)
- Alternativa con Automate (app gratuita)

## 6. Firebase Storage rules

Aggiungi rules per Storage:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /call_recordings/{file} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 7. Deploy + Test

- Deploy functions + hosting + storage rules
- Testa: upload un file audio di test nella chat NEXUS
- Verifica trascrizione + analisi
- Screenshot + report
- Committa con "feat(nexo): trascrizione telefonate + analisi intent + azioni proposte"
