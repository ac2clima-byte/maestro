Il preventivo approvato deve essere creato PRIMA sull'app DOC e POI generato come PDF usando la funzione già esistente in GRAPH.

## Contesto

- App DOC: acg-doc.web.app, progetto garbymobile-f89ac
  - Collection: docfin_documents
  - Cloud Functions: sendPrefattura, approvaPrefattura, marcaComeFatturato
  - Gestisce: proforma, preventivi, ordini, DDT, crediti

- App GRAPH: graph-acg.web.app, progetto garbymobile-f89ac  
  - Collection: graph_documents, graph_templates, graph_counters, graph_companies, graph_config
  - Cloud Function: graphApi
  - Genera PDF da template HTML/CSS + JSON config

## Flusso da implementare

Quando Alberto dice "sì" (approva il preventivo):

### Step 1 — Crea documento su DOC
- Scrivi un nuovo documento in docfin_documents su garbymobile-f89ac con:
  - tipo: "preventivo"
  - numero: progressivo (da graph_counters o docfin_counters)
  - data: oggi
  - intestatario: dati dal preventivo pending
  - voci: array di { descrizione, importo }
  - imponibile, iva_aliquota, iva_importo, iva_regime, iva_nota, totale
  - condominio: nome e indirizzo
  - stato: "bozza"
  - origine: "nexus" (per tracciare che viene dalla chat)

### Step 2 — Genera PDF con GRAPH
- Leggi il codice di GRAPH per capire come funziona graphApi:
  - Cerca in ~/acg_suite/COSMINA/firebase/functions/ la funzione graphApi
  - Come si chiama? Quali parametri accetta?
  - Quale template usa per i preventivi?
- Chiama graphApi (o la funzione equivalente) passando il documento creato
- Se graphApi è una Cloud Function HTTP: chiama via fetch con i dati del preventivo
- Se è un'API interna: usa Admin SDK per triggerare
- Il PDF deve usare il template ACG con logo, dati aziendali, layout professionale

### Step 3 — Mostra in chat
- Salva il PDF in Firebase Storage
- Genera URL scaricabile (getDownloadURL o signed URL)
- Scrivi in nexus_chat: "Preventivo PREV-2026-XXX pronto. [link PDF]. Vuoi che lo mandi a Torriglia?"
- Il link deve essere cliccabile nella PWA

### Step 4 — Alberto può vedere il preventivo su DOC
- Il documento è anche visibile su acg-doc.web.app nella lista documenti
- Alberto può modificarlo da DOC se vuole

## IMPORTANTE
- Leggi il codice sorgente di DOC e GRAPH PRIMA di implementare
- Cerca: find ~/acg_suite/ -path "*doc*" -name "*.js" -o -path "*graph*" -name "*.js" | grep -v node_modules
- Capisclo schema dei documenti, i template, l'API
- NON inventare lo schema — usa quello che DOC e GRAPH già usano
- Se non trovi il codice sorgente, cerca su garbymobile-f89ac le Cloud Functions e leggi lo schema dalle collection Firestore

## Deploy + test
- Testa il flusso completo: prepara preventivo → voci → approva → documento su DOC → PDF → link in chat
- Verifica che il documento appaia su acg-doc.web.app
- Verifica che il PDF sia scaricabile
- Email report

Committa con "feat(preventivo): documento su DOC + PDF via GRAPH"
