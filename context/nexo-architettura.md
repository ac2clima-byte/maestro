# NEXO — Architettura Colleghi AI

_Versione 1.0 — Approvata da Alberto il 17/04/2026_

## Visione

NEXO è una piattaforma di Colleghi AI specializzati per ACG Clima Service e Guazzotti Energia. Ogni Collega è esperto di un dominio, non agisce mai sul dominio di un altro, e comunica con gli altri attraverso la Lavagna. L'Orchestratore coordina i flussi complessi.

Principio guida: **ogni Collega aggiunto deve ridurre il numero di volte al giorno in cui Alberto apre COSMINA manualmente.**

---

## I Colleghi

### 1. IRIS — Collega Email
**Dominio:** Ricezione, classificazione, triage email in arrivo.
**Stato:** v0.1 operativa.

**Cosa fa:**
- Polling EWS ogni 30s da Exchange (remote.gruppobadano.it)
- Classifica con Claude Haiku (11 categorie, 7 azioni suggerite)
- Estrae entità (cliente, condominio, impianto, importo, urgenza)
- Sentiment analysis (5 livelli)
- Thread detection e raggruppamento conversazioni
- Follow-up detection (email senza risposta)
- Profilo mittenti automatico
- Feedback loop: correzioni dell'utente migliorano la classificazione

**Scrive sulla Lavagna quando:**
- RICHIESTA_INTERVENTO → destinatario: ARES
- GUASTO_URGENTE → destinatario: ARES (priorità critical)
- FATTURA_FORNITORE → destinatario: CHARTA
- PEC_UFFICIALE → destinatario: DIKEA
- Email con incassi/pagamenti → destinatario: CHARTA
- Email che richiede notifica urgente → destinatario: ECHO

**Non fa:** Non risponde alle email (lo fa CALLIOPE). Non apre interventi (lo fa ARES). Non manda notifiche (lo fa ECHO).

**Stack:** Firebase Cloud Functions, Firestore, exchangelib (Python), Claude Haiku API, PWA su Firebase Hosting.
**Collections Firestore:** `iris_emails`, `iris_threads`, `iris_corrections`, `iris_sender_profiles`
**PWA:** https://nexo-hub-15f2d.web.app

---

### 2. ECHO — Collega Comunicazione
**Dominio:** Comunicazione in uscita su tutti i canali: WhatsApp, Telegram, email, notifiche push, voce.
**Stato:** Da costruire. Primo dopo IRIS.

**Cosa fa:**
- Manda messaggi WhatsApp via Waha (già operativo per COSMINA Inbox)
- Manda messaggi Telegram
- Manda email in uscita via Exchange/SMTP
- Notifiche push sulla PWA
- Sintesi vocale (TTS) con edge-tts (già in HERMES)
- Ascolto vocale (STT) con Whisper (già in HERMES)

**Riceve dalla Lavagna:**
- Richieste di notifica da qualsiasi Collega
- Digest da IRIS (riassunto mattutino)
- Alert da PHARO
- Agenda giornaliera da CHRONOS

**Non fa:** Non decide cosa comunicare (lo decidono gli altri Colleghi). Non classifica (lo fa IRIS). Non scrive bozze lunghe (lo fa CALLIOPE).

**Stack:** Node.js, Waha API, Exchange EWS, edge-tts, faster-whisper, Telegram Bot API.
**Collections Firestore:** `echo_messages`, `echo_channels`, `echo_preferences`

---

### 3. ARES — Collega Operativo
**Dominio:** Interventi tecnici: apertura, assegnazione, chiusura, rapportini.
**Stato:** Da costruire. Tier 1.

**Cosa fa:**
- Apre interventi in COSMINA
- Assegna tecnici (usa disponibilità + zona + competenze)
- Chiude interventi con esito, ore lavorate, materiali usati
- Genera RTI (Rapporto Tecnico Intervento) via GRAPH API
- Notifica tecnici via push su `cosmina_notifiche`
- Cerca storico interventi per diagnosi

**Riceve dalla Lavagna:**
- RICHIESTA_INTERVENTO da IRIS
- GUASTO_URGENTE da IRIS
- Slot disponibili da CHRONOS

**Scrive sulla Lavagna:**
- Richiesta slot a CHRONOS
- Richiesta disponibilità ricambio a EMPORION
- Notifica completamento a ECHO
- Richiesta DiCo a DIKEA (a fine intervento)

**Non fa:** Non pianifica (lo fa CHRONOS). Non gestisce magazzino (lo fa EMPORION). Non legge email (lo fa IRIS).

**Stack:** Node.js/TypeScript, Firebase Admin SDK, COSMINA Firestore.
**Collections Firestore:** `ares_interventi`, `ares_assegnazioni`
**App toccate:** COSMINA, PWA Tecnici, CosminaMobile, Guazzotti TEC

---

### 4. CHRONOS — Collega Pianificatore
**Dominio:** Tempo e disponibilità. Unico responsabile di "quando".
**Stato:** Da costruire. Tier 1.

**Cosa fa:**
- Gestisce agenda di ogni tecnico (Andrea, Lorenzo, Victor, Marco, David)
- Trova slot disponibili per zona e competenza
- Conosce scadenze manutenzione periodica
- Pianifica campagne stagionali (accensione/spegnimento)
- Rileva conflitti di pianificazione
- Riprogramma interventi
- Prepara agenda giornaliera per briefing

**Riceve dalla Lavagna:**
- Richieste slot da ARES
- Scadenze normative da DIKEA
- Scadenze contrattuali da MEMO

**Scrive sulla Lavagna:**
- Slot proposti a ARES
- Avvisi scadenza a ECHO
- Conflitti rilevati a ARES

**Non fa:** Non apre interventi (lo fa ARES). Non gestisce clienti (lo fa MEMO).

**Stack:** Node.js/TypeScript, Firebase Admin SDK, Google Calendar API (opzionale).
**Collections Firestore:** `chronos_agende`, `chronos_scadenze`, `chronos_campagne`
**App toccate:** COSMINA, KANT, Guazzotti TEC

---

### 5. MEMO — Collega Memoria
**Dominio:** Dossier unico per cliente/condominio/impianto. Il "chi è costui" di ogni Collega.
**Stato:** Da costruire. Tier 1.

**Cosa fa:**
- Costruisce dossier unificato per cliente (impianti, interventi, pagamenti, documenti)
- Storico impianto completo (RTI, sostituzioni, manutenzioni)
- Cerca documenti su disco N/I/L/M
- Timeline ultimi contatti (email + interventi + fatture)
- Consumi medi per condominio (da READER)
- Match anagrafico cross-COSMINA/CRM (deduplicazione)

**Riceve dalla Lavagna:**
- Richieste "chi è questo mittente?" da IRIS
- Richieste storico da ARES (per diagnosi)
- Richieste esposizione da CHARTA

**Scrive sulla Lavagna:**
- Dossier cliente a chi lo chiede
- Alert "nuovo cliente non presente nel CRM"

**Non fa:** Non modifica i dati della Suite (li legge e li aggrega). Non classifica email (lo fa IRIS).

**Stack:** Node.js/TypeScript, Firebase Admin SDK, accesso filesystem dischi N/I/L/M.
**Collections Firestore:** `memo_dossier`, `memo_cache`
**App toccate:** COSMINA, DOC, READER, Guazzotti TEC, dischi di rete

---

### 6. CHARTA — Collega Amministrativo
**Dominio:** Soldi in entrata e in uscita. Fatture, DDT, incassi, pagamenti, solleciti.
**Stato:** Da costruire. Tier 2.

**Cosa fa:**
- Monitora scadenze fatture (emesse e ricevute)
- Registra pagamenti e incassi
- Calcola esposizione per cliente
- Parsa fatture fornitori da email (OCR)
- Confronta DDT con ordini (match Cambielli)
- Genera report mensile emesso/incassato/da incassare
- Estrae dati incassi da email (testo o allegato Excel)

**Riceve dalla Lavagna:**
- FATTURA_FORNITORE da IRIS
- Email con incassi da IRIS
- Richieste stato pagamento da ARES

**Scrive sulla Lavagna:**
- Alert scadenze a ECHO
- Richiesta sollecito a CALLIOPE
- Richiesta PEC diffida a DIKEA
- Dati finanziari a DELPHI

**Non fa:** Non scrive solleciti (lo fa CALLIOPE). Non gestisce PEC legali (lo fa DIKEA).

**Stack:** Node.js/TypeScript, Firebase Admin SDK, Fatture in Cloud API.
**Collections Firestore:** `charta_fatture`, `charta_pagamenti`, `charta_scadenze`
**App toccate:** Guazzotti TEC, COSMINA, Fatture in Cloud

---

### 7. EMPORION — Collega Magazzino
**Dominio:** Articoli, giacenze, furgoni tecnici, ordini fornitori, listini.
**Stato:** Da costruire. Tier 2.

**Cosa fa:**
- Verifica disponibilità ricambio (magazzino centrale + furgoni)
- Localizza articolo (dove si trova fisicamente)
- Prepara bozza ordine fornitore
- Gestisce trasferimenti tra magazzini/furgoni
- Confronta listini tra fornitori (prezzo migliore)
- Suggerisce riordino su scorta minima
- OCR DDT per carico automatico magazzino

**Riceve dalla Lavagna:**
- Richiesta disponibilità da ARES ("c'è il pezzo?")
- DDT da parsare da IRIS/CHARTA

**Scrive sulla Lavagna:**
- Disponibilità/indisponibilità a ARES
- Ordini confermati a CHARTA (debito)
- Alert scorta minima a ECHO

**Non fa:** Non paga (lo fa CHARTA). Non assegna tecnici (lo fa ARES).

**Stack:** Node.js/TypeScript, Firebase Admin SDK, Magazzino Pro (Flask/SQLite).
**Collections Firestore:** `emporion_giacenze`, `emporion_ordini`, `emporion_movimenti`
**App toccate:** COSMINA (magazzino), Magazzino Pro

---

### 8. DIKEA — Collega Compliance
**Dominio:** Normative, scadenze legali, CURIT, DiCo, F-Gas, PEC ufficiali.
**Stato:** Da costruire. Tier 3.

**Cosa fa:**
- Monitora scadenze CURIT (REE, bollini)
- Valida DiCo prima dell'invio (campi obbligatori)
- Genera DiCo post-intervento
- Gestisce risposte PEC formali
- Verifica certificazioni F-Gas
- Individua impianti senza targa (da regolarizzare)
- Audit accessi e conformità GDPR

**Riceve dalla Lavagna:**
- PEC_UFFICIALE da IRIS
- Richiesta DiCo da ARES (post-intervento)
- Scadenze normative da CHRONOS

**Scrive sulla Lavagna:**
- Scadenze normative a CHRONOS
- Alert conformità a ECHO
- Bozze PEC a CALLIOPE

**Non fa:** Non scrive le PEC (lo fa CALLIOPE). Non gestisce gli interventi (lo fa ARES).

**Stack:** Node.js/TypeScript, Firebase Admin SDK, worker Python CURIT.
**Collections Firestore:** `dikea_scadenze`, `dikea_dico`, `dikea_pec`
**App toccate:** COSMINA (CIT), compilatore DiCo

---

### 9. DELPHI — Collega Analisi
**Dominio:** Numeri, KPI, trend, margini, proiezioni. Risponde a domande analitiche.
**Stato:** Da costruire. Tier 3.

**Cosa fa:**
- Calcola margine per intervento (materiali vs fatturato)
- Classifica condomini (fatturato, problemi, redditività)
- Proiezione incassi
- Produttività tecnici (ore fatturabili vs lavorate)
- Costi AI della piattaforma
- Rileva anomalie su metriche
- Genera dashboard e report PDF

**Riceve dalla Lavagna:**
- Richieste analitiche da qualsiasi Collega
- Dati finanziari da CHARTA
- Dati operativi da ARES

**Scrive sulla Lavagna:**
- Report a ECHO (per invio ad Alberto)
- Anomalie a PHARO

**Non fa:** Non genera azioni operative. È read-only su tutti i dati degli altri Colleghi.

**Stack:** Python/FastAPI, Postgres (Railway via Diogene), Firebase Admin SDK.
**Collections Firestore:** `delphi_reports`, `delphi_cache`
**App toccate:** Diogene, COSMINA, Guazzotti TEC

---

### 10. PHARO — Collega Monitoring
**Dominio:** Sorveglianza proattiva. Controlla che tutto funzioni e niente venga dimenticato.
**Stato:** Da costruire. Tier 2.

**Cosa fa:**
- Heartbeat worker Python e Cloud Functions
- Budget alert API Anthropic
- Individua impianti orfani (scadenza passata, nessun intervento)
- Individua clienti silenziosi (rischio churn)
- Raggruppa email senza risposta (da IRIS follow-up)
- Verifica integrità dataset (duplicati, inconsistenze)
- Health check consolidato della Suite

**Riceve dalla Lavagna:**
- Anomalie da DELPHI
- Dati di stato da tutti i Colleghi

**Scrive sulla Lavagna:**
- Alert e notifiche a ECHO
- Segnalazioni anomalie a tutti i Colleghi interessati

**Non fa:** Non risolve i problemi, li segnala. Non agisce, osserva.

**Stack:** Node.js/TypeScript, cron jobs, Firebase Admin SDK.
**Collections Firestore:** `pharo_alerts`, `pharo_heartbeat`, `pharo_checks`
**App toccate:** Trasversale (tutte)

---

### 11. CALLIOPE — Collega Content
**Dominio:** Output scritto: risposte email, comunicazioni, preventivi, solleciti, newsletter.
**Stato:** Da costruire. Tier 3.

**Cosa fa:**
- Scrive bozze di risposta email (con contesto dalla Lavagna)
- Prepara comunicazioni per condomini
- Genera preventivi formali da template + listino
- Scrive newsletter per tecnici
- Scrive risposte PEC formali (su richiesta di DIKEA)
- Scrive lettere di sollecito (su richiesta di CHARTA)
- Trascrive riunioni (audio → testo con Whisper)

**Riceve dalla Lavagna:**
- Richieste bozza da IRIS, CHARTA, DIKEA
- Contesto cliente da MEMO
- Dati operativi da ARES/CHRONOS

**Scrive sulla Lavagna:**
- Bozze pronte a ECHO (per invio) o a IRIS (per approvazione Alberto)

**Non fa:** Non invia mai direttamente. Alberto approva sempre. Non classifica (lo fa IRIS).

**Stack:** Node.js/TypeScript, Claude API (Sonnet per qualità), GRAPH API (template PDF).
**Collections Firestore:** `calliope_bozze`, `calliope_template`
**App toccate:** GRAPH, COSMINA (CRM per dati destinatario)

---

## L'Orchestratore — NEXO Core

**Ruolo:** Coordina flussi che coinvolgono più Colleghi. Legge la Lavagna, decide chi deve fare cosa quando la situazione è ambigua.

**Quando serve:**
- Un messaggio sulla Lavagna ha `to: "orchestrator"` (il Collega mittente non sa a chi mandarlo)
- Un flusso richiede coordinamento sequenziale (IRIS → ARES → CHRONOS → ECHO)
- Un conflitto tra Colleghi (ARES vuole uno slot che CHRONOS dice occupato)
- Un task fallisce e serve retry/escalation

**Quando NON serve:**
- Messaggi diretti da Collega a Collega (IRIS → ARES): passano senza orchestrazione
- Azioni semplici dentro un singolo Collega

**Implementazione v0.1:**
- Cloud Function che ascolta `nexo_lavagna` con trigger `onCreate`
- Se `to == "orchestrator"`: analizza il payload, decide il destinatario, riscrive il messaggio con `to` corretto
- Se un messaggio resta `pending` per più di 30 minuti: escalation a ECHO (notifica Alberto)

**Implementazione futura:**
- LLM-powered: l'Orchestratore usa Claude per decidere il routing in casi ambigui
- Workflow engine: flussi multi-step definiti in YAML/JSON
- Dashboard di monitoring dei flussi attivi

**Stack:** Cloud Functions (TypeScript), Firestore triggers.
**Collections Firestore:** `nexo_orchestrator_log`, `nexo_workflows`

---

## La Lavagna — nexo_lavagna

**Ruolo:** Bus di comunicazione tra tutti i Colleghi. Collection Firestore unica.

**Schema documento:**
```
nexo_lavagna/{messageId}
{
  id: string               // auto-generated
  from: string             // nome collega mittente ("iris", "ares", "echo", ...)
  to: string               // destinatario ("ares", "orchestrator", ...)
  type: string             // tipo messaggio (vedi sotto)
  payload: object          // dati specifici del messaggio
  status: "pending" | "picked_up" | "completed" | "failed"
  priority: "low" | "normal" | "high" | "critical"
  sourceEmailId?: string   // riferimento email originale (se da IRIS)
  parentMessageId?: string // per catene di messaggi
  pickedUpAt?: timestamp
  completedAt?: timestamp
  failedReason?: string
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Tipi di messaggio:**
- `richiesta_intervento` — IRIS → ARES
- `guasto_urgente` — IRIS → ARES (priority: critical)
- `richiesta_slot` — ARES → CHRONOS
- `slot_proposto` — CHRONOS → ARES
- `notifica` — qualsiasi → ECHO
- `richiesta_dossier` — qualsiasi → MEMO
- `fattura_ricevuta` — IRIS → CHARTA
- `incassi_ricevuti` — IRIS → CHARTA
- `richiesta_disponibilita` — ARES → EMPORION
- `pec_ricevuta` — IRIS → DIKEA
- `richiesta_dico` — ARES → DIKEA
- `richiesta_bozza` — qualsiasi → CALLIOPE
- `bozza_pronta` — CALLIOPE → richiedente
- `alert` — PHARO → ECHO
- `richiesta_analisi` — qualsiasi → DELPHI
- `report_pronto` — DELPHI → richiedente
- `task_completato` — qualsiasi → mittente originale
- `escalation` — Orchestratore → ECHO

**Regole:**
1. Ogni Collega legge SOLO i messaggi con `to` uguale al suo nome
2. Quando prende in carico un messaggio, lo segna come `picked_up`
3. Quando finisce, lo segna come `completed` con risultato nel payload
4. Se fallisce, lo segna come `failed` con motivo
5. Mai cancellare messaggi — sono lo storico di tutte le operazioni
6. L'Orchestratore legge i messaggi con `to: "orchestrator"` e quelli `pending` da troppo tempo

**Già implementata:** Sì, in `projects/nexo-core/lavagna/` (Lavagna.ts, 245 righe + test 360 righe).

---

## Grafo delle relazioni

```
                      ┌──────────┐
                      │   ECHO   │ (comunicazione)
                      └────┬─────┘
                           │
      ┌────────┐      ┌────┴──────┐      ┌──────────┐
      │  IRIS  │◀────▶│ LAVAGNA   │◀────▶│  PHARO   │
      │ email  │      │ (bus)     │      │ monitor  │
      └───┬────┘      └─────┬────┘      └──────────┘
          │                 │
          │            ┌────┴──────┐
          │            │ORCHESTRAT.│
          │            └────┬──────┘
          ▼                 │
    ┌─────────┐      ┌─────┴────┐      ┌──────────┐
    │  ARES   │◀────▶│ CHRONOS  │      │  MEMO    │
    │ operaz. │      │ agenda   │      │ memoria  │
    └─────────┘      └──────────┘      └────┬─────┘
                                            │
    ┌─────────┐      ┌──────────┐      ┌────┴─────┐
    │ CHARTA  │◀────▶│ EMPORION │      │  DIKEA   │
    │ amminist│      │ magazzino│      │ norme    │
    └────┬────┘      └──────────┘      └──────────┘
         │
         ▼
    ┌─────────┐           ┌──────────┐
    │ DELPHI  │           │ CALLIOPE │
    │ analisi │           │ content  │
    └─────────┘           └──────────┘
```

---

## Firebase — Progetto condiviso

**Project ID:** nexo-hub-15f2d
**Region:** us-central1
**Hosting:** https://nexo-hub-15f2d.web.app

Tutti i Colleghi condividono lo stesso progetto Firebase. Ogni Collega ha le sue collections prefissate con il proprio nome (iris_, ares_, echo_, ecc.). La Lavagna è unica: `nexo_lavagna`.

---

## Ordine di implementazione

**Tier 1 — Fondamenta** (abilitano tutto il resto):
1. ✅ **IRIS** — Operativa v0.1
2. **ARES** — Formalizza come Collega, già riceve dalla Lavagna
3. **MEMO** — Il contesto cliente serve a tutti
4. **CHRONOS** — Senza agenda ARES non sa schedulare

**Tier 2 — Alto valore operativo:**
5. **ECHO** — Abilita notifiche per tutti i Colleghi
6. **CHARTA** — Liberare Alberto dall'amministrativo
7. **EMPORION** — Magazzino è lavoro ripetitivo quotidiano
8. **PHARO** — Inizia come cron semplice, cresce

**Tier 3 — Quando i dati ci sono:**
9. **DIKEA** — Utile quando PEC e DiCo diventano volume
10. **DELPHI** — Ha senso dopo 3-6 mesi di dati puliti
11. **CALLIOPE** — Ghostwriter del gruppo

---

## Vincoli architetturali

1. **Ogni Collega fa il suo mestiere.** Non agisce mai sul dominio di un altro.
2. **La comunicazione passa dalla Lavagna.** Mai chiamate dirette tra Colleghi.
3. **Alberto decide.** Nessun Collega invia email, manda WA, o modifica dati critici senza approvazione (almeno in v0.1).
4. **Un progetto Firebase, tante collections.** Non un progetto per Collega.
5. **Stack condiviso:** Node.js/TypeScript per i Colleghi, Python per script specifici (ML, OCR, EWS), vanilla JS per le PWA.
6. **Lingua:** Italiano per UI, prompt, e comunicazione. Inglese per codice.
