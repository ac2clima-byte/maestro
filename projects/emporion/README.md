# EMPORION — Collega Magazzino

**Stato:** Da costruire (Tier 2 nel piano NEXO).

**Dominio:** articoli, giacenze, furgoni dei tecnici, ordini fornitori,
listini. Sa se un ricambio c'è, dov'è, quanto costa e a chi ordinarlo.

## Cosa fa (azioni esposte)

### Disponibilità

- `disponibilita(query)` — quantità totali per articolo (centrale +
  furgoni)
- `dovSiTrova(articoloId)` — distribuzione fisica per posizione
- `articoliSottoScorta(zona?)` — alert scorta minima

### Movimenti

- `carico(input)` — carico in magazzino (manuale o da DDT)
- `scarico(input)` — scarico (consumo intervento, vendita, scarto)
- `trasferisci(articoloId, da, a, qta, opts?)` — tra posizioni

### Ordini fornitori

- `creaOrdine(input)` — bozza ordine (multi-righe, multi-articolo)
- `ordiniInCorso(query?)` — ordini in attesa di consegna
- `ricevutoOrdine(ordineId, opts?)` — chiude ordine, carica magazzino
- `suggerisciRiordino(zona?)` — basato su scorta minima + storico consumi

### Listini

- `listiniComparati(codice | descrizione)` — confronto prezzi multi-fornitore

### DDT (input automatico)

- `ocrDDT(allegato)` — riconosce articoli da PDF/immagine
- `caricaDaDDT(ddtId, opts?)` — applica un DDT al magazzino (carico)

### Furgoni

- `inventarioFurgone(tecnicoUid)` — vista per furgone
- `rifornisciFurgone(tecnicoUid, articoli)` — proposta trasferimenti

### Cataloghi e compatibilità

- `articoliCompatibili(impiantoTarga)` — ricambi compatibili con
  marca/modello (richiede catalogo manutenibile)

## Posizioni magazzino supportate

In v0.1 hardcoded ma estendibili:

- `centrale` — magazzino fisso ACG
- `furgone_malvicino`
- `furgone_dellafiore`
- `furgone_victor`
- `furgone_marco`
- `furgone_david`
- `cantiere` — temporanea, su un cantiere specifico

## Riceve dalla Lavagna

- `richiesta_disponibilita_ricambio` — ARES → EMPORION
- `materiali_consumati` — ARES → EMPORION (a fine intervento)
- `ddt_ricevuto` — IRIS/CHARTA → EMPORION (per OCR + carico automatico)

## Scrive sulla Lavagna

- `disponibilita_risposta` → ARES (con qta + posizioni)
- `alert_scorta_minima` → ECHO
- `ordine_da_confermare` → CHARTA (impatto debito)

## Non fa

- Non paga gli ordini (lo fa **CHARTA**).
- Non assegna i tecnici (lo fa **ARES**).
- Non genera fatture (lo fa **CHARTA**).

## Collections Firestore

- `emporion_giacenze` — quantità per (articolo, posizione)
- `emporion_movimenti` — log atomico di tutti i carichi/scarichi/trasferimenti
- `emporion_ordini` — ordini fornitori (bozza/inviato/ricevuto)
- `emporion_articoli` — anagrafica articoli + compatibilità
- `emporion_listini` — prezzi per (articolo, fornitore, data)

## App toccate

COSMINA (`magazzino`, `magazzino_giacenze`, `magazzino_movimenti`,
`magazzino_listini`, Cloud Function `magazzino.js` per OCR), Magazzino
Pro (Flask/SQLite, API HTTP).

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore (collections nexo + COSMINA mirror)
- (futuro) HTTP client per Magazzino Pro
- OCR delegato (script Python esterno) per `ocrDDT`

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `COSMINA_PROJECT_ID=acg-clima-service`
- `MAGAZZINO_PRO_URL` — base URL del servizio (se attivo)
- `MAGAZZINO_PRO_TOKEN`
- `DRY_RUN=false` — se `true`, movimenti e ordini vengono loggati ma
  non scritti realmente

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] Modello giacenze (somma movimenti vs snapshot periodico)
- [ ] Sync iniziale articoli da `magazzino` COSMINA → `emporion_articoli`
- [ ] `disponibilita` aggregata centrale+furgoni con TTL
- [ ] `caricaDaDDT` con guard "già caricato" (idempotenza)
- [ ] Listener Lavagna + status machine
