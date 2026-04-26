NEXUS non sa creare interventi. Quando Alberto dice "mettigli intervento domani" cerca invece di creare.

## Il problema
Alberto: "ok, ci deve andare anche domani mattina con david, mettigli intervento"
NEXUS: cerca interventi di David invece di crearne uno nuovo

## Fix

### 1. Nuovo handler handleAresCreaIntervento in handlers/ares.js

Quando Alberto dice "metti intervento", "crea intervento", "programma intervento", "aggiungi intervento":
- Estrai: tecnico/i, data, luogo, descrizione
- In DRY_RUN (default): mostra riepilogo e chiedi conferma
  "Creo intervento per Federico e David, domani alle Via Toscanini Alessandria, dare il bianco. Confermi?"
- Se Alberto conferma: scrivi in bacheca_cards su garbymobile-f89ac con:
  - listName: "INTERVENTI DA ESEGUIRE"
  - techName: primo tecnico
  - techNames: [tutti i tecnici]
  - name: descrizione
  - due: data (ISO string)
  - boardName: condominio/indirizzo
  - status: "aperto"
  - createdBy: "NEXUS"

### 2. Haiku deve capire l'intenzione

Nel system prompt di Haiku (nexus.js), aggiungi:
- Nuova azione: "ares/crea_intervento" per frasi tipo "metti intervento", "programma intervento", "aggiungi intervento a [tecnico]"
- Distinguere "cerca interventi" da "crea intervento": se c'è "metti", "crea", "programma", "aggiungi" → crea. Se c'è "aveva", "ha", "quali", "che" → cerca.

### 3. Contesto conversazionale

NEXUS deve usare il contesto della conversazione precedente:
- Se Alberto prima ha chiesto "che interventi aveva Federico giovedì?" e poi dice "mettigli intervento domani"
- NEXUS deve capire che "gli" = Federico, "domani" = data, e riusare il luogo dell'intervento precedente
- Salva il contesto dell'ultima ricerca in sessione

### 4. DRY_RUN di default
MAI creare interventi senza conferma. Sempre dry-run:
- Mostra riepilogo → Alberto conferma → crea

## Test con nexusTestInternal (DRY_RUN forzato per FORGE)
1. "metti intervento a Federico domani ad Alessandria" → mostra riepilogo, chiede conferma
2. "programma Marco lunedì al Kristal" → mostra riepilogo

Deploy + test + email report.
Committa con "feat(ares): crea intervento da chat NEXUS"
