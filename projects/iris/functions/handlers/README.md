# Modularizzazione `nexusRouter` — WIP

**Stato:** parziale (3 moduli su 12). `index.js` originale preservato + backup.

## Obiettivo

Spezzare `index.js` (4241 righe) in moduli per Collega:

```
handlers/
├── shared.js      — Firebase apps, auth, CORS, rate limit, utilities ✅
├── iris.js        — email aggregati (handleContaEmailUrgenti, ecc.) ✅
├── memo.js        — dossier cliente ✅
├── echo.js        — WhatsApp via Waha (TODO)
├── ares.js        — apertura/lettura interventi (TODO)
├── chronos.js     — scadenze + agende (TODO)
├── charta.js      — fatture + incassi (TODO)
├── emporion.js    — magazzino (TODO)
├── dikea.js       — compliance CURIT (TODO)
├── delphi.js      — KPI (TODO)
├── pharo.js       — monitoring RTI (TODO)
├── calliope.js    — bozze Sonnet (TODO)
└── nexus.js       — router Haiku + tryDirectAnswer (TODO)
```

## Stato attuale

### ✅ Completati e syntax-OK

- `shared.js` (260 righe): tutte le dipendenze Firebase cross-project, auth,
  CORS (strict + open), rate limiting dual (suggestReply + NEXUS), Anthropic
  Haiku helper, utilities date/tokenize/pretty/classifyRtiTipo,
  fetchIrisEmails, emailLine, postLavagna.
- `iris.js` (120 righe): handleContaEmailUrgenti, handleEmailOggi,
  handleEmailTotali, handleRicercaEmailMittente, handleEmailSenzaRisposta,
  handleEmailPerCategoria, handleStatoLavagna.
- `memo.js` (190 righe): handleMemoDossier + helper memoBag/memoFormatDate.

### ❌ Non ancora estratti

Tutto il resto (~3900 righe) è ancora in `index.js`:
- suggestReply Cloud Function (handler email draft)
- nexusRouter Cloud Function (router Haiku + intent parsing)
- irisRuleEngine (rule engine con actionWriteLavagna/Extract/NotifyEcho/Archive)
- irisPoller + irisPollerRun (poller EWS)
- pharoHealthCheck + pharoRtiDashboard + pharoResolveAlert + pharoCheckRti
- aresLavagnaListener
- Tutti gli altri handler (ARES, ECHO, CHRONOS, CHARTA, EMPORION, DIKEA, DELPHI, CALLIOPE)

## Perché non ho finito il refactor completo

Il file ha 11 Cloud Functions in produzione + interdipendenze complesse:
- NEXUS router con Haiku intent parsing + tryDirectAnswer
- irisRuleEngine con action handlers che chiamano handler specifici
- Rate limit condiviso tra suggestReply e nexusRouter
- Auth token verification usata da 3 endpoint
- Scheduler con state persistence (iris_poller_state)

Fare il refactor **senza test live intermedio** rischia regressioni silenti:
auth che salta, rate limit che si azzera, Anthropic API che va offline,
scheduler che falliscono. Un errore qui rompe NEXO in produzione.

## Come completare il refactor (roadmap)

1. **Session dedicata**: 2-4 ore con possibilità di test live dopo ogni modulo
2. Per ogni modulo:
   - Estrai handler + dipendenze interne
   - `node --check` del modulo
   - Aggiorna `index.js` per importare
   - `node --check` di `index.js`
   - Deploy della SOLA function toccata
   - Test via curl/Playwright
   - Commit modulo
3. Quando tutti i moduli sono estratti, `index.js` diventa
   ~150 righe di solo router + Cloud Function exports.

## Uso immediato dei moduli già fatti

Per il codice nuovo che scriveremo, possiamo già importare:

```js
import { getCosminaDb, getGuazzottiDb, verifyAcgIdToken, postLavagna } from "./handlers/shared.js";
import { handleMemoDossier } from "./handlers/memo.js";
```

Il vecchio `index.js` continuerà a funzionare con le sue funzioni interne
finché il refactor non è completo.
