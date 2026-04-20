# CHARTA — Collega Amministrativo

**Stato:** Da costruire (Tier 2 nel piano NEXO).

**Dominio:** soldi in entrata e in uscita. Fatture emesse e ricevute,
DDT, incassi, pagamenti, esposizione cliente, solleciti, riconciliazione
automatica.

## Cosa fa (azioni esposte)

### Fatture

- `registraFattura(input)` — crea/aggiorna una fattura emessa o ricevuta
- `parseFatturaFornitore(allegato)` — OCR di una fattura fornitore (PDF/XML)
- `scadenzeFatture(finestra)` — fatture in scadenza nei prossimi N giorni
- `fattureScadute(query?)` — fatture già scadute non incassate

### Incassi e pagamenti

- `registraIncasso(input)` — registra un incasso cliente
- `estraiIncassiDaEmail(emailId)` — parsing testo da email "INCASSI ACG"
- `estraiIncassiDaExcel(filePath | bytes)` — parsing allegato XLSX

### DDT

- `registraDDT(input)` — DDT da fornitore o verso cliente
- `parseDDT(allegato)` — OCR DDT (PDF/immagine)
- `controllaDDTvsFattura(ddtId)` — match DDT ↔ fattura attesa
- `ddtSenzaFattura(query?)` — DDT non ancora fatturati (alert per Cambielli)

### Esposizione e report

- `esposizioneCliente(clienteId)` — totale dovuto + giorni medio pagamento
- `clientiAltaEsposizione(soglia)` — top N debitori
- `reportMensile(yyyy-mm)` — emesso / incassato / da incassare
- `reportAnnuale(yyyy)` — vista aggregata anno

### Solleciti e riconciliazione

- `generaSollecito(fatturaId, tono)` — bozza richiesta a CALLIOPE
- `sollecitiBatch(soglia)` — solleciti per tutte le scadute > N giorni
- `riconciliaAutomatica()` — match incassi-fatture per importo+causale+cliente

## Riceve dalla Lavagna

- `fattura_ricevuta` — IRIS → CHARTA (con allegato classificato fattura)
- `incassi_ricevuti` — IRIS → CHARTA (es. "I: INCASSI ACG" da Malvicino)
- `offerta_fornitore` — IRIS → CHARTA (per tracciatura, non vincolante)
- `richiesta_esposizione` — qualsiasi → CHARTA (ARES/MEMO/DELPHI)

## Scrive sulla Lavagna

- `alert_scadenza` → ECHO (fatture in scadenza)
- `richiesta_sollecito` → CALLIOPE (bozza testo sollecito)
- `richiesta_pec_diffida` → DIKEA (per debiti gravi)
- `dati_finanziari` → DELPHI (per analisi)

## Non fa

- Non scrive il testo dei solleciti (lo fa **CALLIOPE**).
- Non gestisce le PEC legali (lo fa **DIKEA**).
- Non calcola margini per intervento (lo fa **DELPHI**).
- Non emette le fatture su Fatture in Cloud — registra ciò che esiste lì.

## Collections Firestore

- `charta_fatture` — registro unificato (emesse + ricevute)
- `charta_pagamenti` — incassi e pagamenti
- `charta_scadenze` — vista materializzata delle scadenze attive
- `charta_ddt` — DDT (da fornitore o emessi)
- `charta_riconciliazioni` — log dei match automatici (con confidence)

## App toccate

Guazzotti TEC (`pagamenti_clienti`, `commesse`), COSMINA (anagrafica
clienti per esposizione), Fatture in Cloud (SaaS, via API).

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore (multi-progetto: nexo + Guazzotti + COSMINA)
- (futuro) Fatture in Cloud API client
- (futuro) `pdfplumber`/`pypdfium2` per parsing PDF (probabilmente in un
  micro-script Python invocato dal Node, pattern già usato in IRIS)

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `COSMINA_PROJECT_ID=acg-clima-service`
- `GUAZZOTTI_PROJECT_ID=guazzotti-tec`
- `FATTURE_IN_CLOUD_API_KEY` — per query e write (lettura prioritaria)
- `DRY_RUN=false` — se `true`, registrazioni e solleciti vengono loggati
  ma non scritti realmente

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] Sync iniziale fatture da Fatture in Cloud → `charta_fatture`
- [ ] `estraiIncassiDaExcel` per il flusso Malvicino (Excel mensile)
- [ ] `riconciliaAutomatica` con regole deterministiche (no LLM)
- [ ] Listener Lavagna + status machine
- [ ] Export report mensile in PDF via GRAPH API
