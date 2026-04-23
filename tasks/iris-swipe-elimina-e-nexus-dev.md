Due cose da fare:

## 1. IRIS — Swipe a destra per eliminare/archiviare email

Nella PWA, nella lista email di IRIS:
- Swipe a destra su una email → mostra bottone rosso "🗑️ Elimina" o "📁 Archivia"
- Implementa con touch events (touchstart, touchmove, touchend)
- Swipe >100px → attiva l'azione
- Animazione fluida: la riga si sposta a destra, sfondo rosso appare sotto
- Conferma: dopo lo swipe, la riga scompare con animazione fade-out
- Azione: segna l'email come archived in iris_emails (non eliminarla davvero)
- Funziona anche su desktop con mouse (mousedown, mousemove, mouseup)

## 2. NEXUS — Accetta richieste di sviluppo

NEXUS ha risposto "non rientra nelle mie competenze" quando Alberto ha chiesto una modifica al codice. SBAGLIATO.

Fix nel routing NEXUS (handlers/nexus.js):
- Quando l'utente chiede modifiche UI, nuove feature, bug fix, o qualsiasi richiesta di sviluppo:
  - NON rifiutare
  - Salva la richiesta in nexo_dev_requests (collection già esistente)
  - Rispondi: "Ho registrato la richiesta di sviluppo: '[descrizione]'. La trovi nella coda sviluppo. Vuoi aggiungere dettagli?"
- Aggiungi intent "richiesta_sviluppo" alla lista intent riconosciuti
- Pattern da riconoscere: "aggiungi", "modifica", "cambia", "vorrei", "puoi fare", "swipe", "bottone", "feature", "bug"

Deploy functions + hosting.
Committa con "feat(iris): swipe elimina + feat(nexus): accetta richieste sviluppo"
