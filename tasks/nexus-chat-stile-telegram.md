Ridisegna la chat NEXUS con lo stile grafico di Telegram.

Riferimenti visivi di Telegram da replicare:

1. BOLLE MESSAGGI:
   - Utente (destra): bolla verde/azzurra con coda triangolare, bordi arrotondati
   - NEXUS (sinistra): bolla bianca/grigio chiaro con coda triangolare
   - Ombra leggera sotto ogni bolla
   - Timestamp piccolo in basso a destra dentro la bolla (grigio chiaro, font piccolo)
   - Max width ~70% dello schermo

2. SFONDO:
   - Pattern sottile come Telegram (o colore piatto azzurro/grigio molto chiaro)
   - No sfondo bianco piatto

3. BARRA INPUT (in basso):
   - Sfondo bianco con bordo arrotondato (pill shape)
   - Icona 📎 a sinistra (per allegati/audio futuri)
   - Campo testo al centro con placeholder "Scrivi un messaggio..."
   - Icona 🎤 a destra (microfono) che diventa ➤ (invio) quando c'è testo
   - Fissa in basso, non si muove con lo scroll

4. HEADER:
   - Sfondo colorato (azzurro NEXO #00d4ff o più scuro)
   - Avatar NEXO (cerchio con icona 🧠) a sinistra
   - Nome "NEXUS" in bianco, sotto "online" o "sta scrivendo..."
   - Bottoni a destra: 🔊 (voce), 🗑️ (cancella), ✕ (chiudi)

5. TYPING INDICATOR:
   - Tre pallini animati (come Telegram) quando NEXUS sta pensando
   - Testo "NEXUS sta scrivendo..." nell'header

6. MESSAGGI SISTEMA:
   - Badge centrale data (come Telegram: "Oggi", "Ieri", "23 aprile")
   - Badge Collega piccolo sotto la bolla NEXUS (es. "via IRIS" in chip colorato)

7. SCROLL:
   - Scroll fluido
   - Bottone "↓" in basso a destra quando non sei in fondo (come Telegram)
   - Auto-scroll al nuovo messaggio

8. ANIMAZIONI:
   - Bolla entra con leggera animazione slide-up
   - Transizione fluida apertura/chiusura pannello

9. MOBILE:
   - Full screen (100vh) come una vera app di chat
   - Header fisso in alto, input fisso in basso
   - Area messaggi scrollabile al centro

Mantieni tutte le funzionalità esistenti (routing Colleghi, badge, esempi cliccabili).
Non usare framework — vanilla CSS come il resto della PWA.

Deploy hosting.
Committa con "feat(nexus): interfaccia chat stile Telegram"
