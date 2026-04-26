Il workflow preventivo deve funzionare come una conversazione reale, NON generare prezzi inventati.

## Flusso corretto

Quando NEXUS riceve "prepara preventivo per De Amicis intestato a 3i":

### Step 1 — Raccogli dati automaticamente (NEXUS fa da solo, non chiede)
- MEMO cerca "De Amicis" nel CRM → indirizzo, impianti, amministratore
- MEMO cerca "3i efficientamento" → ragione sociale, P.IVA, indirizzo sede (da memo_aziende o cerca in rete)
- Se non trova l'azienda: chiedi "Non trovo 3i nel CRM. Dammi la P.IVA e cerco i dati."

### Step 2 — Chiedi le voci ad Alberto (NON inventare prezzi)
NEXUS risponde in chat:
"Ho i dati per il preventivo De Amicis:
- Intestatario: 3i efficientamento energetico S.r.l., P.IVA 02486680065, Via [indirizzo trovato]
- Condominio: De Amicis, Via De Amicis 12, Tortona
- Impianti: [lista da CRM]

Che voci vuoi inserire? Dimmi descrizione e importo per ogni voce."

### Step 3 — Alberto risponde con le voci
Alberto scrive: "sopralluogo 200, relazione tecnica 150, verifica impianto 300"

NEXUS parsa le voci:
- Sopralluogo: €200
- Relazione tecnica: €150
- Verifica impianto: €300
- Totale: €650 + IVA 22% = €793

NEXUS conferma: "Preventivo €793 IVA inclusa. Lo genero in PDF?"

### Step 4 — Genera PDF con GRAPH
Alberto: "sì"

- Chiama GRAPH API (o genera direttamente) per creare il PDF con template ACG
- Template ACG deve avere: logo, dati aziendali ACG, intestatario, oggetto, voci con importi, totale, condizioni pagamento, firma
- Se GRAPH API non è disponibile: genera un PDF con una libreria (pdfkit, puppeteer HTML→PDF)
- Salva il PDF in Firebase Storage o nel filesystem
- Salva in calliope_bozze + charta_preventivi

### Step 5 — Mostra PDF in chat
NEXUS: "Preventivo PREV-2026-XXX pronto. [link PDF scaricabile]. Vuoi approvare e mandare a Torriglia?"

Il link PDF deve essere cliccabile e scaricabile dalla chat NEXUS.

### Step 6 — Alberto approva
Alberto: "approva e manda a Torriglia, CC Poggi"

- ECHO manda email a davide.torriglia@gruppo3i.it con PDF allegato
- CC: massimo.poggi@guazzottienergia.com (dal thread originale)
- Oggetto: "Offerta verifica riscaldamento - Condominio De Amicis"
- Corpo: testo professionale generato da CALLIOPE
- Aggiorna charta_preventivi: stato="inviato"

NEXUS: "Preventivo inviato a Torriglia con copia a Poggi."

## Implementazione tecnica

### In handlers/preventivo.js:
1. Modifica runPreventivoWorkflow: NON chiamare Sonnet per generare prezzi
2. Dopo aver raccolto i dati (azienda + condominio), rispondi chiedendo le voci
3. Nuovo handler handlePreventivoVoci: parsa le voci dalla risposta di Alberto (regex: "descrizione importo")
4. Nuovo handler handlePreventivoGeneraPdf: 
   - Genera HTML con template ACG (usa il design system in context/memo-acg-suite-mappa.md)
   - Converti HTML→PDF con puppeteer (già disponibile per Playwright) o pdfkit
   - Salva in Firebase Storage bucket nexo-hub-15f2d
   - Ritorna URL download
5. Modifica tryInterceptPreventivoApproval: gestisci "approva e manda a [destinatario]"

### Template PDF ACG:
Intestazione:
- Logo ACG Clima Service (o testo "ACG CLIMA SERVICE S.R.L.")
- Via Duccio Galimberti 47, 15121 Alessandria
- Sede operativa: Via Zanardi Bonfiglio 68, Voghera
- Tel: +39 0383 640606
- P.IVA: 02735970069
- IBAN: IT42J0306910400100000132126

Corpo:
- "PREVENTIVO N. [numero] del [data]"
- Spett.le [intestatario + indirizzo + P.IVA]
- Oggetto: [descrizione lavoro] - [condominio]
- Tabella voci: N. | Descrizione | Importo
- Totale imponibile
- IVA 22%
- Totale
- Condizioni: "Pagamento a 30gg DFFM" (default, Alberto può cambiare)
- Validità: 30 giorni
- Firma: Alberto Contardi

### In NEXUS Chat (frontend):
- Quando NEXUS manda un link PDF, renderizzalo come bottone scaricabile nella bolla
- Stile: icona 📄 + "Scarica preventivo PREV-2026-XXX.pdf"

### Deploy functions + hosting
### Testa il flusso completo con Playwright (simulando le risposte di Alberto)
### Manda email report: "NEXO FORGE: workflow-preventivo-reale [PASS/FAIL]"
### Committa con "feat(preventivo): flusso reale con voci manuali + PDF + invio email"
