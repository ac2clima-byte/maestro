# IRIS — Collega Email di NEXO

Sistema di classificazione email con triage intelligente per l'ecosistema NEXO.

## Descrizione

IRIS è il "collega email" di NEXO: monitora la casella aziendale, classifica le email in arrivo, estrae entità rilevanti (clienti, impianti, date, importi), suggerisce azioni e impara dalle correzioni dell'utente tramite un feedback loop.

## Stack

- **Runtime**: Firebase Cloud Functions 2nd Gen (Node.js, TypeScript)
- **Database**: Firestore
- **Hosting PWA**: Firebase Hosting
- **LLM**: Claude Haiku API (`@anthropic-ai/sdk`)
- **Source email**: Exchange Web Services (EWS)

## Architettura

```
┌──────────────┐    ┌──────────────┐    ┌───────────┐    ┌─────┐
│ EWS polling  │───▶│ Classifier   │───▶│ Firestore │───▶│ PWA │
│ (ogni 30s)   │    │ (Haiku)      │    │           │    │     │
└──────────────┘    └──────────────┘    └───────────┘    └─────┘
                           ▲                   │
                           │                   ▼
                    ┌──────────────┐    ┌──────────────┐
                    │ Prompt +     │◀───│ Feedback /   │
                    │ memoria      │    │ correzioni   │
                    └──────────────┘    └──────────────┘
```

1. **Ingestion**: polling EWS ogni 30s → fetch nuove email
2. **Classifier**: Claude Haiku assegna categoria + priorità
3. **Entities**: estrazione entità (cliente, impianto, data, importo)
4. **Persistenza**: scrittura su Firestore
5. **PWA**: triage UI per l'utente (conferma/correggi classificazione)
6. **Memory**: correzioni utente → few-shot esempi nel prompt successivo

## Moduli (`src/`)

| Modulo              | Responsabilità                              |
|---------------------|---------------------------------------------|
| `email-ingestion/`  | Client EWS, polling, dedup                  |
| `classifier/`       | Chiamata Haiku, parsing risposta            |
| `entities/`         | Estrazione entità strutturate               |
| `memory/`           | Feedback loop, storage correzioni           |
| `api/`              | Endpoint HTTPS consumati dalla PWA          |
| `types/`            | Tipi TypeScript condivisi                   |

## Stato

**v0.1** — in sviluppo. Struttura di progetto inizializzata.
