# NEXO — Chrome Extension "Manda a NEXUS"

Chrome Extension (Manifest V3) che permette di inviare rapidamente messaggi
WhatsApp Web e testo selezionato dovunque alla chat NEXUS della PWA NEXO.

## Cosa fa

1. **Su WhatsApp Web** (`web.whatsapp.com`): un piccolo bottone 🧠 appare
   sull'angolo in alto a destra di ogni bolla messaggio quando ci passi sopra
   col mouse. Click → il testo del messaggio viene aperto in NEXUS Chat.

2. **Su qualsiasi pagina**: seleziona del testo, tasto destro → "🧠 Manda a NEXO"
   (voce aggiunta al menu contestuale). Il testo selezionato va in NEXUS.

3. **Scorciatoia da tastiera**: `Ctrl+Shift+N` (Mac: `Cmd+Shift+N`) — manda
   la selezione corrente a NEXUS. Se non c'è selezione, apre NEXO + chat vuota.

4. **Icona dell'estensione**: click sull'icona 🧠 nella toolbar di Chrome →
   apre NEXO con la chat NEXUS già aperta.

## Installazione (modalità sviluppatore)

1. Apri Chrome e vai a `chrome://extensions`
2. In alto a destra attiva **Modalità sviluppatore**
3. Click su **Carica estensione non pacchettizzata**
4. Seleziona la cartella `projects/nexo-chrome-extension` di questo repo
5. L'estensione compare in elenco: verifica che sia **abilitata**
6. Vai su `https://web.whatsapp.com/` — sui messaggi vedrai il bottone 🧠

## Come funziona sotto il cofano

| File              | Ruolo                                                                 |
|-------------------|-----------------------------------------------------------------------|
| `manifest.json`   | Manifest V3, permissions (`activeTab`, `contextMenus`, `tabs`, host), commands. |
| `content.js`      | Injected su `web.whatsapp.com`. MutationObserver sui `div[role="row"]` → aggiunge il bottone 🧠. Click manda messaggio al background. |
| `content.css`     | Stile del bottone (piccolo, hover-only, rispetta dark mode WhatsApp). |
| `background.js`   | Service worker. Registra context menu, shortcut, action icon. Riceve messaggi dal content script e apre `https://nexo-hub-15f2d.web.app?share=...&openNexus=1`. Se c'è già una tab NEXO aperta, la aggiorna invece di aprirne una nuova. |
| `icon48.png`, `icon128.png` | Icone dell'estensione (cerchio cyan con "N"). |

## Formato URL condivisione

L'estensione apre la PWA a:
```
https://nexo-hub-15f2d.web.app?share={testo_url_encoded}&source={whatsapp|selection|shortcut}&openNexus=1
```

La PWA al bootstrap legge il parametro `share`, apre la NEXUS chat, pre-popola
il campo input con il testo, e pulisce l'URL (`history.replaceState`).

Max payload: 3000 char. Testi più lunghi vengono troncati dal background worker.

## Limiti noti

- **WhatsApp Web cambia spesso la struttura DOM**: i selettori potrebbero
  rompersi dopo update di WA. Il codice cerca multipli selettori per robustezza,
  ma se il bottone non appare: apri la devtools console, filtra `[NEXO WA]`,
  e verifica che il content script sia caricato. Se serve, aggiorna i selettori
  in `extractMessageText()` di `content.js`.
- **Allegati**: attualmente viene estratto solo il testo. Immagini/audio/file
  allegati non vengono mandati (richiederebbe download + upload a Firebase
  Storage). TODO v0.2.
- **Shortcut Ctrl+Shift+N** confligge con "Nuova finestra in incognito" su
  Chrome. Se preferisci, rimappa da `chrome://extensions/shortcuts`.

## Sviluppo

Dopo modifiche ai file:
1. `chrome://extensions` → click su **🔄 Ricarica** nella card dell'estensione
2. Ricarica la pagina `web.whatsapp.com`
3. Per vedere i log del content script: DevTools su WA Web, console, filtra `[NEXO WA]`
4. Per vedere i log del service worker: `chrome://extensions` → **Ispeziona visualizzazioni: service worker**

## Roadmap

- v0.1 (questa): testo messaggio → NEXUS
- v0.2: allegati (immagini/audio) → upload a Firebase Storage + IRIS classifica
- v0.3: risposta "inline" (NEXUS scrive la bozza e la inietta nel box reply di WA)
- v0.4: bottone "Manda tutta la chat" per inviare contesto thread completo
