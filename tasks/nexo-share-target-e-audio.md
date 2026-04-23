Implementa la condivisione verso NEXO e l'upload audio chiamate.

## 1. Web Share Target (Android)

La PWA deve registrarsi come target di condivisione Android.

In projects/nexo-pwa/public/manifest.json (crealo se non esiste):
```json
{
  "name": "NEXO",
  "short_name": "NEXO",
  "start_url": "/",
  "display": "standalone",
  "share_target": {
    "action": "/?share=true",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "media",
          "accept": ["audio/*", "image/*", "application/pdf", "text/*"]
        }
      ]
    }
  }
}
```

Nella PWA:
- Rileva se la pagina è stata aperta con ?share=true
- Se sì: apri NEXUS Chat con il testo/file condiviso già nel campo input
- Se è testo: mostra "Messaggio ricevuto via condivisione: [testo]. Analizzo?"
- Se è audio: carica e trascrivi con Whisper
- Se è immagine/PDF: mostra anteprima e chiedi cosa fare

## 2. Upload audio chiamate

Nella chat NEXUS aggiungi un bottone 📞 accanto al microfono:
- Click → apre file picker filtrato per audio (accept="audio/*")
- Seleziona il file audio della registrazione chiamata
- Upload alla Cloud Function
- Cloud Function chiama Whisper API per trascrizione (o usa un servizio gratuito)
- Ritorna la trascrizione a NEXUS
- NEXUS analizza e propone azioni: "Ho capito che hai parlato con [nome]. Vuole [cosa]. Propongo: [azioni]"

Cloud Function: nexusTranscribeAudio
- In handlers/nexus-audio.js
- Riceve audio multipart
- Chiama Whisper API (api.openai.com/v1/audio/transcriptions) oppure usa una alternativa gratuita
- Ritorna { text: "trascrizione completa" }
- Poi chiama Haiku per analizzare l'intent della conversazione

Se non hai API key OpenAI per Whisper, usa l'alternativa:
- Web Speech API recognition nel browser (gratuita ma meno precisa)
- Oppure salva l'audio in Firebase Storage e usa un servizio STT gratuito

## 3. NEXUS analisi testo incollato

Nella chat NEXUS, quando Alberto incolla un testo lungo (>200 caratteri) o scrive "analizza questo: [testo]":
- Riconosci che è un messaggio da analizzare, non una domanda
- Analizza con Haiku: chi parla, cosa vuole, intent, azioni suggerite
- Rispondi: "Ho letto il messaggio di [nome]. Vuole [cosa]. Suggerisco: [azioni]. Procedo?"

Deploy hosting + functions.
Committa con "feat(nexo): share target Android + upload audio + analisi testo"
