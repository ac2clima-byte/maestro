# PHARO — Collega Monitoring

**Stato:** Da costruire (Tier 2 nel piano NEXO).

**Dominio:** sorveglianza proattiva. Controlla che tutto funzioni e
niente venga dimenticato. Non risolve i problemi: li segnala. Non
agisce, osserva.

## Cosa fa (azioni esposte)

### Health check infrastruttura

- `controlloHeartbeat()` — worker Python + Cloud Functions + Colleghi attivi
- `statoSuite()` — vista consolidata di tutti i servizi ACG
- `reportSalute()` — report PDF mensile

### Budget e costi

- `budgetAnthropic(mese)` — spesa token corrente vs soglia
- `costiInfrastruttura(finestra)` — Firebase + hosting + altri cloud

### Pattern operativi dimenticati

- `impiantiOrfani()` — scadenza passata + nessun intervento
- `emailSenzaRisposta()` — aggregato F3 IRIS (> 48h, categoria
  che richiede risposta)
- `interventiBloccati()` — interventi aperti > N giorni senza movimento
- `fattureNonInviate()` — fatture bozza da > X giorni
- `clientiSilenziosi(mesi)` — churn risk

### Integrità dataset

- `duplicatiDatabase(collection?)` — match anagrafici duplicati
  cross-database

### Gestione alert

- `alertAttivi(filters?)` — alert non ancora risolti
- `acknowledgeAlert(alertId, nota?)` — preso in carico da un umano
- `risolviAlert(alertId, risoluzione?)` — chiuso
- `silenziaAlert(alertId, finoA)` — snooze temporaneo

### Regole monitoring

- `listaRegole()` — regole attive di check periodico
- `creaRegola(regola)` — nuova regola (predicato + soglia + canale alert)
- `eseguiControlliPeriodici()` — cron entry-point (ogni 5 min via scheduler)

## Riceve dalla Lavagna

- `anomalia_rilevata` — DELPHI → PHARO (con metrica + scostamento)

## Scrive sulla Lavagna

- `alert` → ECHO (notifica sul canale preferito di Alberto)
- `segnalazione` → Collega competente (es. `fatture_non_inviate` → CHARTA)

## Non fa

- Non risolve i problemi: li segnala.
- Non scrive testo di notifiche lunghe (lo fa **CALLIOPE**).
- Non è un analyst (lo fa **DELPHI**).

## Collections Firestore

- `pharo_alerts` — alert attivi/risolti (append-only)
- `pharo_heartbeat` — log heartbeat servizi
- `pharo_checks` — regole di check + ultima esecuzione
- `pharo_budget` — snapshot periodici consumi AI / cloud

## App toccate

Trasversale: tutte. Lettura da tutti i progetti Firebase
(`nexo-hub-15f2d`, `acg-clima-service`, `guazzotti-tec`) e da tutte
le collections.

## Stack

Node.js + TypeScript (ESM, strict). **Nessun LLM**: solo regole
deterministiche e query Firestore. Cron schedulato (Cloud Scheduler /
cron locale) che invoca `eseguiControlliPeriodici`.

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `COSMINA_PROJECT_ID=acg-clima-service`
- `ANTHROPIC_BUDGET_MONTHLY=50` — soglia EUR mensile → alert giallo a
  50% e rosso a 90%
- `HEARTBEAT_INTERVAL_SECONDS=300` — quanto spesso eseguire i check
- `DRY_RUN=false` — se `true`, alert vengono loggati ma non scritti in
  `pharo_alerts`

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] `eseguiControlliPeriodici` con 6-8 regole base hardcoded
- [ ] Deduplica alert ricorrenti (stesso `ruleId + ref` → alert
  aggiornato, non duplicato)
- [ ] Cron schedulato via Cloud Scheduler (Blaze) o file systemd locale
- [ ] Dashboard `alertAttivi` integrata nella PWA NEXO
- [ ] Politica retention `pharo_alerts` (12 mesi)
