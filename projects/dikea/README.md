# DIKEA — Collega Compliance

**Stato:** Da costruire (Tier 3 nel piano NEXO).

**Dominio:** normative, scadenze legali, CURIT, DiCo (DM 37/2008),
F-Gas (Reg. EU 517/2014), PEC ufficiali. Il guardiano della compliance.

## Cosa fa (azioni esposte)

### CURIT

- `scadenzeCURIT(finestra)` — REE, bollini in scadenza nei prossimi N giorni
- `verificaStatoCURIT(targa)` — query stato impianto sul portale CURIT
- `impiantiSenzaTarga(zona?)` — impianti CRM senza targa CURIT (da regolarizzare)
- `impiantiNonRegistrati(zona?)` — installati ma non registrati a catasto

### DiCo (Dichiarazione di Conformità DM 37/2008)

- `generaDiCo(interventoId)` — bozza partendo dai dati intervento
- `validaDiCo(bozza)` — validazione campi obbligatori prima invio
- `inviaDiCo(dicoId)` — invio formale (firma + protocollo)
- `dicoMancanti(query?)` — interventi che richiederebbero DiCo non emessa

### F-Gas (Reg. EU 517/2014)

- `checkFGas(impiantoId)` — verifica certificazioni F-Gas valide
- `scadenzeFGas(finestra)` — controlli periodici in scadenza

### PEC

- `gestisciPEC(emailId)` — registra PEC ricevuta + classifica priorità
- `bozzaRispostaPEC(pecId)` — richiesta a CALLIOPE per testo formale
- `pecInScadenza(query?)` — PEC con termine di risposta imminente

### Audit / GDPR

- `auditAccessi(uid?, finestra?)` — log accessi e operazioni sensibili
- `verificaConformitaGDPR(scope?)` — controllo policy retention/consenti
- `reportConformita(yyyy-mm)` — report mensile compliance

## Riceve dalla Lavagna

- `pec_ricevuta` — IRIS → DIKEA (con allegato PEC)
- `richiesta_dico` — ARES → DIKEA (a fine intervento che richiede DiCo)
- `scadenza_normativa` — CHRONOS → DIKEA (eco di scadenze inserite altrove)

## Scrive sulla Lavagna

- `scadenza_normativa` → CHRONOS (per inserire nel calendario)
- `alert_conformita` → ECHO (alert urgenti — es. PEC da rispondere oggi)
- `richiesta_bozza` → CALLIOPE (testo formale PEC, lettera diffida)

## Non fa

- Non scrive il testo delle PEC (lo fa **CALLIOPE**, su richiesta).
- Non gestisce gli interventi tecnici (lo fa **ARES**).
- Non manda notifiche (lo fa **ECHO**).

## Collections Firestore

- `dikea_scadenze` — scadenze normative tracciate (CURIT, F-Gas, PEC)
- `dikea_dico` — DiCo emesse, in bozza, da emettere
- `dikea_pec` — registro PEC con stato risposta
- `dikea_audit` — log audit accessi e operazioni sensibili

## App toccate

COSMINA (`cosmina_impianti_cit`, `gdpr_consents`, `audit_log`),
worker Python CURIT, compilatore DiCo, IRIS (categoria `PEC_UFFICIALE`),
GRAPH API (per PDF DiCo).

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore (multi-progetto: nexo + COSMINA)
- Anthropic SDK — Claude **Sonnet** (precisione critica per validazione
  campi obbligatori e generazione DiCo, dove un errore espone a sanzioni)

## Modello AI

`LLM_MODEL=claude-sonnet-4-5` (default). Sonnet preferito ad Haiku
perché:

1. La validazione DiCo riguarda obblighi di legge (DM 37/2008): un falso
   "ok" genera responsabilità.
2. Le risposte PEC ufficiali devono essere giuridicamente accurate.
3. Il volume è basso (1-5 chiamate/giorno) → costo trascurabile.

Per query CURIT in batch (es. `scadenzeCURIT`) si può degradare ad
Haiku, configurabile per-azione.

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `COSMINA_PROJECT_ID=acg-clima-service`
- `CURIT_USERNAME` / `CURIT_PASSWORD` — credenziali portale Piemonte
- `ANTHROPIC_API_KEY`
- `LLM_MODEL=claude-sonnet-4-5`
- `DRY_RUN=false` — se `true`, invio DiCo / bozze PEC vengono loggati
  ma non emessi davvero

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] Sync iniziale `cosmina_impianti_cit` → `dikea_scadenze` (REE, bollini)
- [ ] `validaDiCo` con regole hardcoded (campi obbligatori) + LLM check
- [ ] Listener Lavagna + status machine
- [ ] Integrazione worker Python CURIT (read-only in v0.1)
- [ ] Politica retention `dikea_audit` (10 anni per legge)
