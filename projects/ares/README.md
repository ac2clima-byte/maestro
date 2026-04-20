# ARES — Collega Operativo

**Stato:** Da costruire (Tier 1 nel piano NEXO).

**Dominio:** interventi tecnici. Apertura, assegnazione, chiusura,
generazione RTI/RTIDF. Non pianifica (lo fa **CHRONOS**), non gestisce
ricambi (lo fa **EMPORION**), non legge email (lo fa **IRIS**).

## Cosa fa (azioni esposte)

- `apriIntervento(input)` — crea intervento in COSMINA
- `assegnaTecnico(interventoId, tecnicoId)` — assegna manualmente
- `proponiAssegnazioni(interventoId)` — top-3 candidati ranked per
  disponibilità + zona + competenze
- `chiudiIntervento(interventoId, esito)` — chiusura con ore/materiali
- `generaRTI(interventoId)` — PDF via GRAPH API
- `notificaTecnico(tecnicoId, payload)` — push su `cosmina_notifiche`
  (in v0.1: scrive una notifica → ECHO la spedisce sul canale preferito)
- `briefingTecnico(tecnicoId, data)` — agenda del giorno per un tecnico
- `interventiAperti(filters?)` — query stato corrente
- `cercaStoricoInterventi(impiantoId)` — per diagnosi

## Riceve dalla Lavagna

- `richiesta_intervento` — IRIS → ARES
- `guasto_urgente` — IRIS → ARES (priority: critical)
- `slot_proposto` — CHRONOS → ARES (risposta a una nostra richiesta)
- `disponibilita_risposta` — EMPORION → ARES (risposta su ricambi)

## Scrive sulla Lavagna

- `richiesta_slot` → CHRONOS
- `richiesta_disponibilita` → EMPORION
- `richiesta_dico` → DIKEA (a fine intervento)
- `notifica` → ECHO (chiusura, completamento, escalation)

## Non fa

- Non pianifica nel calendario (lo fa **CHRONOS**).
- Non gestisce magazzino/ricambi (lo fa **EMPORION**).
- Non legge email (lo fa **IRIS**).
- Non scrive bozze comunicazione cliente (lo fa **CALLIOPE**).

## Collections Firestore

- `ares_interventi` — interventi gestiti da ARES (visione operativa,
  rispecchia/sincronizza con `cosmina_interventi_pianificati`)
- `ares_assegnazioni` — log di tutte le assegnazioni proposte/accettate

## App toccate

COSMINA, PWA Tecnici, CosminaMobile, Guazzotti TEC, GRAPH (per RTI).

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore (sia `nexo-hub-15f2d` che il progetto
  COSMINA — vedi `COSMINA_PROJECT_ID`)

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d` (collections nexo)
- `COSMINA_PROJECT_ID=acg-clima-service` (collections operative COSMINA)
- `GRAPH_API_URL`, `GRAPH_API_KEY` per generare RTI
- `DRY_RUN=false` — se `true`, le azioni vengono loggate ma non eseguite
  realmente (i dati COSMINA non vengono toccati)

## Sviluppo

```bash
npm install
npm run dev        # tsx watch su src/index.ts
npm test           # vitest
npm run build      # tsc → dist/
```

## TODO v0.1

- [ ] `apriIntervento` collegato a `cosmina_interventi_pianificati`
- [ ] Algoritmo `proponiAssegnazioni` (zona + competenze + carico)
- [ ] `generaRTI` via GRAPH API (template intervento standard)
- [ ] Listener Lavagna + status machine (pending → picked_up → completed)
- [ ] Test integrazione contro Firestore emulator
