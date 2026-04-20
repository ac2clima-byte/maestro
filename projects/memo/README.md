# MEMO — Collega Memoria

**Stato:** Da costruire (Tier 1 nel piano NEXO).

**Dominio:** dossier unico per cliente / condominio / impianto. Il
"chi è costui?" di tutti gli altri Colleghi. Aggrega Firestore
(COSMINA + Guazzotti TEC) con i dischi di rete (N/I/L/M) e i flussi
operativi (interventi, fatture, email IRIS).

## Cosa fa (azioni esposte)

- `dossierCliente(clienteId)` — pacchetto completo di un cliente
- `dossierCondominio(condominioId)` — vista per condominio (impianti +
  amministratore + esposizione + ultime email)
- `storicoImpianto(targa)` — RTI, sostituzioni, manutenzioni, anomalie
- `cercaDocumenti(query)` — ricerca su disco N (clienti) + I (tecnico) +
  L (interni ACG) + M (admin condivisi)
- `ultimiContatti(clienteId, n?)` — timeline cross-canale
- `matchAnagrafica(nome | dati)` — dedup cross-COSMINA/CRM/Condominium
- `nuovoCliente(dati)` — crea record `crm_clienti` coerente
- `collegaEntita(da, a)` — collega entità eterogenee (es. impianto ↔ condominio)
- `consumiMedi(condominio, anni?)` — da READER
- `rischioChurn(clienteId)` — score 0-100 (silenzio + frequenza +
  esposizione + sentiment medio email)
- `cercaPerContesto(testoLibero)` — semantic-ish search per HERMES/ECHO
  ("trovami quel condominio di Voghera con la centrale termica vecchia")

## Riceve dalla Lavagna

- `richiesta_dossier` — qualsiasi → MEMO
- `nuovo_cliente_rilevato` — IRIS → MEMO (mittente non in CRM)

## Scrive sulla Lavagna

- `dossier_pronto` → richiedente originale
- `alert_nuovo_cliente` → ECHO (chiede ad Alberto se vuole crearlo)

## Non fa

- Non modifica dati operativi (lo fanno **ARES**, **CHARTA**,
  **EMPORION**). Read-only su tutto, scrive solo `crm_clienti` su
  richiesta esplicita.
- Non classifica email (lo fa **IRIS**).

## Collections Firestore

- `memo_dossier` — cache dei dossier costruiti (TTL configurabile)
- `memo_cache` — cache di ricerche pesanti (filesystem dischi)

## App toccate

COSMINA, DOC, READER, Guazzotti TEC, dischi `/mnt/n` `/mnt/i` `/mnt/l`
`/mnt/m`, IRIS (lettura `iris_emails` + `iris_sender_profiles`).

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore (multi-progetto: nexo + COSMINA + Guazzotti)
- `node:fs/promises` per ricerca filesystem dischi N/I/L/M
- (futuro) embeddings per `cercaPerContesto`

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `COSMINA_PROJECT_ID=acg-clima-service`
- `GUAZZOTTI_PROJECT_ID=guazzotti-tec`
- `DISCO_N_PATH=/mnt/n` (cartella per cliente)
- `DISCO_I_PATH=/mnt/i` (materiale tecnico)
- `DISCO_L_PATH=/mnt/l` (interni ACG)
- `DISCO_M_PATH=/mnt/m` (admin condivisi)
- `DRY_RUN=false` — se `true`, `nuovoCliente` viene loggato ma non scrive
  realmente

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] `dossierCliente` con cache TTL 1h
- [ ] Indice anagrafico per `matchAnagrafica` (Levenshtein + normalizzazione)
- [ ] Walker filesystem per `cercaDocumenti` con whitelist estensioni
- [ ] Calcolo rischioChurn deterministico (no AI in v0.1)
- [ ] Listener Lavagna + status machine
