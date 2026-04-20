# DELPHI — Collega Analisi

**Stato:** Da costruire (Tier 3 nel piano NEXO).

**Dominio:** numeri, KPI, trend, margini, proiezioni. Risponde a domande
analitiche. Non genera azioni operative — è read-only su tutti i dati
degli altri Colleghi.

## Cosa fa (azioni esposte)

### KPI e dashboard

- `kpiDashboard(scope?)` — set di KPI consolidati (interventi, fatturato,
  margini, ecc.) con valore corrente, target, trend
- `dashboardHTML(preset)` — genera dashboard HTML standalone (per ECHO)

### Marginalità

- `marginePerIntervento(finestra)` — materiali consumati vs fatturato
- `topCondomini(anno, criterio)` — fatturato / interventi / problemi
- `topClienti(anno, criterio)` — analoga ma su clienti privati
- `topTecnici(anno, criterio)` — produttività, utilizzo, qualità

### Produttività

- `produttivitaTecnico(tecnicoUid, mese)` — ore fatturabili vs lavorate
- `produttivitaTeam(mese)` — vista aggregata di tutti i tecnici

### Trend e proiezioni

- `trend(metrica, finestra)` — serie storica + linea regressione
- `previsioneIncassi(mesi)` — proiezione su scadenze + storico pagamenti
- `previsioneCaricoLavoro(mesi)` — interventi previsti per zona

### Confronti

- `confrontoAnnoSuAnno(metrica, anno)` — anno corrente vs precedente

### Anomalie

- `anomalie(metrica, soglia?)` — pattern fuori range (es. consumi
  improvvisamente raddoppiati)

### Costi piattaforma

- `costoAI(finestra)` — token/cost da `cosmina_config/ai_usage`

### Report

- `reportMensile(yyyy-mm)` — report PDF aggregato del mese
- `reportAnnuale(yyyy)` — report annuale

### Conversazionale

- `chiedi(domanda)` — domanda in linguaggio naturale ("come è andato il
  trimestre per Cambielli?"). Usa Sonnet con tool calling sui dati.

## Riceve dalla Lavagna

- `richiesta_analisi` — qualsiasi → DELPHI

## Scrive sulla Lavagna

- `report_pronto` → richiedente originale
- `anomalia_rilevata` → PHARO (per allertare)
- `report_pronto` → ECHO (per invio ad Alberto, su digest)

## Non fa

- Non scrive niente sui dati operativi (read-only su tutto).
- Non manda notifiche dirette (lo fa **ECHO**).
- Non genera azioni (es. "apri intervento di rifornimento") — segnala
  pattern e basta.

## Collections Firestore

- `delphi_reports` — report generati (cache + storage url PDF)
- `delphi_cache` — risultati di query pesanti con TTL
- `delphi_kpi` — snapshot periodici dei KPI principali

## App toccate

Diogene (FastAPI + Postgres su Railway, è "il fratello esistente" di
DELPHI), COSMINA, Guazzotti TEC, GRAPH (per PDF report), CHARTA (dati
finanziari), ARES (dati operativi).

## Stack

Python/FastAPI (per coerenza con Diogene) + Firebase Admin SDK.
**Eccezione**: il modulo "node-side" di DELPHI espone solo le firme
TypeScript del contratto (questo scaffolding) — l'esecuzione effettiva
è delegata a Diogene tramite HTTP.

In v0.1 lo scaffolding è TS come gli altri Colleghi. La transizione a
backend Python avviene quando le query crescono (Postgres serio per
analytics, niente Firestore aggregations).

## Modello AI

`LLM_MODEL=claude-sonnet-4-5` (default). Sonnet preferito ad Haiku per:

1. Analisi multi-step (`chiedi`) richiede ragionamento più profondo.
2. Format numeri + percentuali + intervalli temporali in italiano.
3. Tool calling: invocazione di sotto-azioni (`marginePerIntervento`,
   `topCondomini`, ecc.) come tools.

Volume basso (poche `chiedi` al giorno) → costo accettabile.

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `COSMINA_PROJECT_ID=acg-clima-service`
- `GUAZZOTTI_PROJECT_ID=guazzotti-tec`
- `DIOGENE_API_URL` — base URL del servizio Diogene
- `DIOGENE_API_TOKEN`
- `ANTHROPIC_API_KEY`
- `LLM_MODEL=claude-sonnet-4-5`
- `DRY_RUN=false` — irrilevante per DELPHI (read-only): rispettato per
  uniformità

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] `kpiDashboard` con 6-8 KPI core + cache TTL 5 min
- [ ] `chiedi` con system prompt + tool calling sulle azioni di lettura
- [ ] Listener Lavagna + status machine
- [ ] Migrazione query pesanti da Firestore a Diogene/Postgres quando i
  dataset superano i 10k doc
