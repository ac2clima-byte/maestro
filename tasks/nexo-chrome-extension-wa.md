Crea una Chrome Extension che aggiunge un bottone "Manda a NEXO" su WhatsApp Web.

## Funzionamento

1. Su web.whatsapp.com, accanto a ogni messaggio (hover), appare un piccolo bottone 🧠 NEXO
2. Click sul bottone → prende il testo del messaggio (e allegati se presenti)
3. Apre la PWA NEXO in una nuova tab (o tab esistente) con il testo già nel campo input di NEXUS
4. NEXUS analizza e propone azioni

## Alternativa: Selezione + shortcut

1. Seleziona testo in WA Web (o qualsiasi pagina)
2. Premi Ctrl+Shift+N (o click destro → "Manda a NEXO")
3. Si apre NEXO con il testo selezionato nella chat

## Implementazione

Crea projects/nexo-chrome-extension/ con:

manifest.json (Manifest V3):
```json
{
  "manifest_version": 3,
  "name": "NEXO — Manda a NEXUS",
  "version": "0.1",
  "description": "Invia messaggi WhatsApp Web e testo selezionato a NEXUS per l'analisi",
  "permissions": ["activeTab", "contextMenus"],
  "content_scripts": [{
    "matches": ["https://web.whatsapp.com/*"],
    "js": ["content.js"],
    "css": ["content.css"]
  }],
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "48": "icon48.png",
    "128": "icon128.png"
  }
}
```

content.js:
- Monitora i messaggi su WA Web (MutationObserver sul DOM)
- Aggiunge bottone 🧠 su hover di ogni messaggio
- Click → estrae testo del messaggio → apre NEXO

background.js:
- Registra context menu "Manda a NEXO" (tasto destro su testo selezionato)
- Registra shortcut Ctrl+Shift+N
- Apre https://nexo-hub-15f2d.web.app?share={testo_codificato}

content.css:
- Stile del bottone 🧠 (piccolo, non invasivo, appare solo su hover)

## PWA: gestire il parametro ?share=

Nella PWA, al caricamento:
- Controlla se c'è il parametro URL ?share=xxx
- Se c'è: apri NEXUS Chat, metti il testo decodificato nel campo input
- Rimuovi il parametro dall'URL (history.replaceState)

## Istruzioni installazione

Crea projects/nexo-chrome-extension/README.md con:
1. Apri chrome://extensions
2. Attiva "Modalità sviluppatore"
3. "Carica estensione non pacchettizzata"
4. Seleziona la cartella projects/nexo-chrome-extension
5. Apri WhatsApp Web → vedrai il bottone NEXO

Committa con "feat(nexo): Chrome Extension per WhatsApp Web"
