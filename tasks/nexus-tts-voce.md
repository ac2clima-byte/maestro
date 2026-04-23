Aggiungi output vocale a NEXUS Chat con Web Speech API TTS.

1. Nella PWA, nella barra input della chat NEXUS, aggiungi un toggle 🔊/🔇 accanto al microfono
2. Quando il toggle è ON (modalità vocale):
   - Ogni risposta di NEXUS viene letta ad alta voce con speechSynthesis
   - Usa voce italiana (cerca "it-IT" nelle voci disponibili)
   - Velocità leggermente più alta del default (rate: 1.1)
   - Mentre parla, mostra un indicatore visivo sulla bolla (onde sonore animate)
3. Quando il toggle è OFF: comportamento attuale (solo testo)
4. Salva la preferenza in localStorage
5. Bottone 🔊 anche su ogni singola bolla per riascoltare una risposta specifica
6. Se il browser non supporta speechSynthesis, nascondi il toggle

Deploy hosting.
Committa con "feat(nexus): output vocale TTS"
