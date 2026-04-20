# CALLIOPE — Collega Content

**Stato:** Da costruire (Tier 3 nel piano NEXO).

**Dominio:** output scritto. Bozze di risposta email, comunicazioni
condomini, preventivi formali, solleciti, PEC, newsletter, verbali.
Ghostwriter di tutti gli altri Colleghi. **Alberto approva sempre.**

## Cosa fa (azioni esposte)

### Bozze

- `bozzaRisposta(emailId, tono, contesto?)` — risposta a una email IRIS
- `comunicazioneCondominio(condominioId, motivo, dati?)` — comunicazione
  formale ai condòmini (es. "accensione impianto")
- `preventivoFormale(impiantoId, lavoro, opts?)` — preventivo da template
  + listino
- `sollecitoPagamento(fatturaId, tono)` — sollecito su richiesta di CHARTA
- `rispostaPEC(pecId)` — risposta formale PEC su richiesta di DIKEA
- `offertaCommerciale(clienteId, lavoro)` — offerta nuovo cliente / upsell
- `newsletterTecnici(yyyymm)` — digest mensile per il team
- `comunicazioneMassiva(destinatari, argomento)` — es. tutti gli
  amministratori che hanno caldaia Vaillant

### Trascrizioni

- `trascriviAudio(audioRef)` — via Whisper, per dettature Alberto
- `verbaleRiunione(audioRef)` — trascrizione + riassunto + action items

### Ciclo di vita bozze

- `revisiona(bozzaId, feedback)` — nuova versione a partire dal feedback
- `approva(bozzaId)` — segna come approvata → ECHO può spedirla
- `rifiuta(bozzaId, motivo)` — chiude la bozza come rifiutata

### Template

- `listaTemplate(categoria?)` — elenco template disponibili
- `creaTemplate(template)` — nuovo template (Alberto-only)
- `generaDaTemplate(templateId, variabili)` — renderizza un template
  con placeholder

### Apprendimento stile

- `imparaStile(esempi)` — raccoglie 10-20 email scritte da Alberto, ne
  estrae stile (formalità, lunghezza media, chiusure ricorrenti) e lo
  salva in `calliope_stili`

## Riceve dalla Lavagna

- `richiesta_bozza` — IRIS / qualsiasi → CALLIOPE (bozzaRisposta)
- `richiesta_sollecito` — CHARTA → CALLIOPE (sollecitoPagamento)
- `richiesta_pec` — DIKEA → CALLIOPE (rispostaPEC)

## Scrive sulla Lavagna

- `bozza_pronta` → richiedente originale (per approvazione Alberto)
- `bozza_approvata` → ECHO (dopo approvazione, per invio)

## Non fa

- **Non invia mai direttamente.** Output finale → ECHO, previa
  approvazione di Alberto.
- Non classifica (lo fa **IRIS**).
- Non decide cosa comunicare (lo decidono i Colleghi richiedenti).

## Collections Firestore

- `calliope_bozze` — tutte le bozze, con storico versioni
- `calliope_template` — template riutilizzabili
- `calliope_stili` — profili stilistici appresi

## App toccate

GRAPH API (template PDF per preventivi), COSMINA (CRM clienti per
personalizzazione), IRIS (contesto email + sender profile), MEMO
(dossier destinatario).

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore
- Anthropic SDK — Claude **Sonnet** (qualità del testo italiana)

## Modello AI

`LLM_MODEL=claude-sonnet-4-5` (default). Sonnet preferito ad Haiku per:

1. Qualità stilistica italiana (registro formale, accordi, sintassi).
2. Lunghezze variabili (dalla risposta email di 3 righe al sollecito
   ultimativo di 20 righe).
3. Controllo fine del tono (cordiale / fermo / ultimativo) richiede
   nuance.
4. Volume basso (pochi doc/giorno) → costo accettabile.

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d`
- `ANTHROPIC_API_KEY`
- `LLM_MODEL=claude-sonnet-4-5`
- `GRAPH_API_URL=https://graph-acg.web.app/api/v1/generate`
- `GRAPH_API_KEY`
- `DRY_RUN=false` — se `true`, bozze create ma mai marcate "approvata"
  (per safety durante lo sviluppo)

## Sviluppo

```bash
npm install
npm run dev
npm test
```

## TODO v0.1

- [ ] `bozzaRisposta` con contesto: email originale + sender profile +
  casi simili da IRIS
- [ ] Template base per preventivo, sollecito, comunicazione condominio
- [ ] Versioning bozze (append-only su `calliope_bozze.versioni`)
- [ ] Listener Lavagna + status machine
- [ ] `imparaStile` con estrazione pattern dalle 30 email sent di Alberto
