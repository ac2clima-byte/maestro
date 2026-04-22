# handlers/ — Moduli NEXUS router

Un file per Collega. Ogni handler è auto-contenuto e importa solo da `./shared.js`.

## Struttura

```
handlers/
├── shared.js      ← Firebase apps, CORS, rate limit, auth, utilities
├── iris.js        ← 7 handler email aggregati (urgenti, oggi, totali, ecc.)
├── echo.js        ← invio WhatsApp via Waha + resolver rubrica
├── ares.js        ← interventi (lettura + scrittura bacheca_cards)
├── chronos.js     ← slot tecnici, agenda giornaliera, scadenze
├── memo.js        ← dossier cliente (5 sorgenti cross-project)
├── charta.js      ← incassi, fatture, report mensile
├── emporion.js    ← magazzino (sotto scorta, disponibilità)
├── dikea.js       ← scadenze CURIT/REE, impianti senza targa
├── delphi.js      ← KPI, confronto MoM, costo AI
├── pharo.js       ← monitoring RTI + stato suite + problemi
├── calliope.js    ← bozze email via Claude Sonnet
└── nexus.js       ← router: DIRECT_HANDLERS + tryDirectAnswer
                      + parseAndValidateIntent + session mgmt
```

## Regole

1. **shared.js** è l'unica dipendenza consentita tra moduli (+ il proprio settore Collega)
2. **nexus.js** è l'unico modulo che importa da tutti gli handler (router pattern)
3. **index.js** importa esclusivamente da `handlers/` — contiene solo Cloud Function exports

## Come aggiungere un nuovo handler

1. Crea `handlers/<collega>.js` con funzioni che importano da `./shared.js`
2. Aggiungi l'import in `handlers/nexus.js`
3. Aggiungi la riga in `DIRECT_HANDLERS`
4. Se serve come Cloud Function separata, aggiungi l'export in `index.js`

## Metriche

Prima del refactor: `index.js` = 4241 righe.
Dopo: `index.js` = 768 righe (−82%) + 13 moduli handler (2914 righe totali).

Test integrazione: `import` graph OK, 29 handler registrati in DIRECT_HANDLERS,
11 Cloud Function exports preservate.
