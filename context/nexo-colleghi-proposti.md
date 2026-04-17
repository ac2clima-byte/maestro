# NEXO — Proposta Colleghi

_Analisi ecosistema ACG Suite + ECHO + IRIS — 2026-04-17_

## Nomi definitivi — approvati da Alberto il 17/04/2026

| Collega    | Ruolo                                           | Nome precedente (scartato) |
|------------|-------------------------------------------------|----------------------------|
| IRIS       | Comunicazione email in ingresso                 | —                          |
| ECHO       | Comunicazione: WA, Telegram, notifiche, voce    | HERMES                     |
| ARES       | Operativo / Interventi                          | EFESTO                     |
| CHRONOS    | Pianificatore / Calendario                      | —                          |
| MEMO       | Memoria / Storico cliente                       | MNEMOSYNE                  |
| CHARTA     | Amministrativo / Fatturazione                   | CARONTE                    |
| EMPORION   | Magazzino / Ricambi                             | EOLO                       |
| DIKEA      | Compliance / Normative                          | TEMIDE                     |
| DELPHI     | Analisi / BI                                    | PLUTO                      |
| PHARO      | Monitoring / Alert                              | ARGOS                      |
| CALLIOPE   | Content / Comunicazione in uscita               | —                          |

Nota: "HERMES" continua a esistere come **prodotto** (l'app Electron su
Windows già funzionante); **ECHO** è il nome del Collega NEXO che
comunica verso l'utente — tra cui gestirà il canale voce fornito
da HERMES stesso. Sono due cose diverse, non confondere.

## Criterio di scelta

ECHO è l'interfaccia (messaggero, voce). IRIS è il gateway inbound
(email → classificazione → bus). Gli altri Colleghi devono essere
**specialisti verticali** che coprono un dominio operativo dell'azienda,
NON generalisti. Ognuno possiede la sua collection Firestore / area di
competenza, espone un set di azioni e comunica con gli altri via
`nexo_lavagna` (bus già in piedi).

Ho scartato nomi tipo Zeus/Atena (troppo generici) e nomi già legati a
prodotti esistenti. Ho privilegiato figure con un'associazione funzionale
netta.

---

## 1. ARES — Il Tecnico / Gestore Interventi

**Dominio**
Officina digitale. Prende in carico richieste operative (guasti,
manutenzioni, installazioni) e ne segue il ciclo di vita fino al
rapportino.

**App toccate**
COSMINA (`cosmina_impianti`, `cosmina_interventi_pianificati`,
`cosmina_notifiche`, `cosmina_config/tecnici_acg`) · PWA Tecnici ·
CosminaMobile · Guazzotti TEC (`rti`, `tickets`).

**Azioni**
- `apriIntervento(impiantoId, tipo, urgenza, note)`
- `assegnaTecnico(interventoId)` — usa disponibilità + zona + skill
- `proponiSlot(tecnico, durataStimata)` — prossimi 3 slot liberi
- `chiudiIntervento(interventoId, esito, ore, materiali)`
- `generaRTI(interventoId)` — via GRAPH API
- `notificaTecnico(uid, messaggio)` — push su `cosmina_notifiche`
- `cercaStoricoInterventi(impiantoId)` — per diagnosi

**Interagisce con**
IRIS (riceve `GUASTO_URGENTE` / `RICHIESTA_INTERVENTO`) → MEMO
(storico impianto) → CHRONOS (agenda tecnico) → scrive a ECHO
(notifica vocale).

---

## 2. CHRONOS — Il Pianificatore / Calendario

**Dominio**
Tempo e disponibilità. Unico responsabile di "quando". Possiede l'agenda
di ogni tecnico, conosce le scadenze manutenzione
(`cosmina_impianti.prossima_scadenza`) e le campagne annuali.

**App toccate**
COSMINA (`cosmina_interventi_pianificati`, `cosmina_impianti`,
`cosmina_campagne`) · KANT (cantieri) · Guazzotti TEC (commesse con
`data_inizio`/`data_fine`).

**Azioni**
- `slotDisponibili(tecnico, zona, giorni)`
- `scadenzeProssime(zona, finestraGiorni)` — manutenzioni periodiche
- `pianificaCampagna(anno, comuni)` — batch dai campi `campagne`
- `trovaConflitti(data, tecnico)`
- `riprogramma(interventoId, nuovaData, motivo)`
- `avvisaScadenzaContratto(clienteId, giorniAnticipo)`
- `agendaGiornaliera(tecnico, data)` — JSON per briefing ECHO

**Interagisce con**
ARES (gli passa slot per nuovi interventi), ECHO (legge agenda a
voce), DIKEA (scadenze normative CURIT/CIT).

---

## 3. MEMO — La Memoria / Storico Cliente

**Dominio**
Dossier unico per cliente/condominio/impianto: unisce Firestore, disco N
(cartelle clienti), disco I (schede tecniche), Fatture in Cloud. Il
"chi è costui" di ogni Collega.

**App toccate**
COSMINA (`crm_clienti`, `cosmina_impianti`, `trello_boards`,
`cosmina_document_results`) · DOC/READER · Guazzotti TEC (`rti`,
`commesse`) · dischi N/I/L/M.

**Azioni**
- `dossierCliente(clienteId)` — JSON con impianti, interventi,
  pagamenti, documenti su disco N
- `storicoImpianto(targa)` — tutti gli RTI e sostituzioni ricambi
- `cercaDocumentoCliente(nomeCliente, pattern)` — filesystem `/mnt/n/`
- `ultimiContatti(clienteId, N)` — timeline email+interventi+fatture
- `consumiMedi(condominio, anni)` — da READER
- `nuovoCliente(dati)` — crea `crm_clienti` coerente
- `matchAnagrafica(nome)` — dedup cross-COSMINA/CRM/Condominium

**Interagisce con**
IRIS (chi è il mittente?), ARES (storico per diagnosi), CHARTA
(situazione pagamenti), DELPHI (margini storici).

---

## 4. CHARTA — L'Amministrativo / Fatturazione e Incassi

**Dominio**
Soldi in entrata e in uscita. Fatture emesse, fatture ricevute,
scadenze, solleciti. Presidia Fatture in Cloud, le fatture fornitori
(Cambielli & co.) e i pagamenti clienti.

**App toccate**
Guazzotti TEC (`pagamenti_clienti`, `commesse`) · COSMINA (fatture via
API) · Fatture in Cloud (SaaS esterno) · dischi L/M.

**Azioni**
- `scadenzeFatture(finestra)` — fatture in scadenza o scadute
- `generaSollecito(fatturaId, tono)` — via GRAPH API
- `registraPagamento(clienteId, importo, riferimento)`
- `statoCliente(clienteId)` — esposizione, media giorni pagamento
- `parseFatturaFornitore(allegato)` — OCR da email IRIS
- `controllaDDT(ddtId)` — match con ordine Cambielli
- `reportMensile(mese)` — emesso/incassato/da incassare

**Interagisce con**
IRIS (`FATTURA_FORNITORE` → deposita qui), MEMO (esposizione
cliente), DIKEA (PEC di sollecito/diffida).

---

## 5. EMPORION — Il Magazziniere / Ricambi e Approvvigionamento

**Dominio**
Articoli, giacenze, furgoni dei tecnici, ordini a fornitori. Sa se un
ricambio c'è, dov'è, quanto costa e a chi ordinarlo.

**App toccate**
COSMINA (`magazzino`, `magazzino_giacenze`, `magazzino_movimenti`,
`magazzino_listini`) · OCR ricambi (Cloud Functions `magazzino.js`).

**Azioni**
- `disponibilita(codice | descrizione)`
- `dovSiTrova(articolo)` — centrale | furgone_X
- `ordinaFornitore(articolo, quantita)` — bozza ordine Cambielli
- `trasferisci(articolo, da, a, quantita, tecnico)`
- `listiniComparati(codice)` — prezzo migliore tra fornitori
- `scortaMinima(articolo, periodo)` — suggerisce riordino
- `ocrDDT(pdf)` — riconosce articoli, carica magazzino

**Interagisce con**
ARES (il tecnico chiede "c'è il pezzo?"), CHARTA (ordini = debito),
MEMO (cosa abbiamo montato al cliente X).

---

## 6. DIKEA — Il Compliance / Normative e CURIT

**Dominio**
Normative, scadenze legali, CURIT, DiCo, DM 37/2008, PEC ufficiali. Il
"guardiano" che conosce il DPR 74/2013.

**App toccate**
COSMINA (`cosmina_impianti_cit`, `gdpr_consents`, `audit_log`) · worker
Python CURIT · IRIS (categoria `PEC_UFFICIALE`) · compilatore DiCo.

**Azioni**
- `scadenzeCURIT(finestra)` — impianti con REE in scadenza
- `validaDiCo(bozza)` — controllo campi obbligatori prima invio
- `impiantiSenzaTarga(zona)` — da regolarizzare
- `generaDiCo(interventoId)` — via `compilatore.js` + GRAPH
- `rispostaPEC(pecId)` — bozza di risposta formale
- `auditAccessi(uid, finestra)` — chi ha letto cosa
- `checkF-gas(impiantoId)` — certificazioni valide?

**Interagisce con**
IRIS (riceve PEC), ARES (DiCo a fine intervento), CHRONOS (scadenze),
MEMO (storico conformità impianto).

---

## 7. DELPHI — L'Analista / Diogene + BI

**Dominio**
Numeri. Margini, KPI, trend, proiezioni. Non genera azioni: risponde a
domande analitiche. Alleggerisce Diogene.

**App toccate**
Diogene (FastAPI + Postgres Railway) · COSMINA (analytics) · Guazzotti
TEC (commesse) · dati `cost`/`ai_usage`.

**Azioni**
- `marginePerIntervento(finestra)` — materiali vs fatturato
- `topCondomini(anno, criterio)` — fatturato, interventi, problemi
- `previsionIncassi(mesi)` — proiezione
- `tecnicoProduttivita(tecnico, mese)` — ore fatturabili vs lavorate
- `costoAI(finestra)` — da `cosmina_config/ai_usage`
- `anomalie(metrica, soglia)` — alert su pattern insoliti
- `dashboard(preset)` — genera report HTML/PDF

**Interagisce con**
Tutti (read-only). Spesso ECHO ("Alberto vuole i numeri del mese").

---

## 8. PHARO — Il Watchman / Scadenze, Monitoring, Alert

**Dominio**
Sorveglianza proattiva. Mentre gli altri Colleghi fanno, PHARO guarda:
quote cost-alert, worker Python offline, scadenze dimenticate, pattern
sospetti. Il "cento occhi" della Suite.

**App toccate**
Trasversale (`cosmina_workers` heartbeat, `audit_log`,
`cosmina_config/ai_usage`, qualunque timestamp).

**Azioni**
- `controlloHeartbeat()` — worker Python, Cloud Functions
- `budgetAnthropic(mese)` — alert sopra soglia
- `impiantiOrfani()` — scadenza passata + nessun intervento
- `clientiSilenziosi(mesi)` — nessun contatto da N mesi (churn risk)
- `emailSenzaRisposta()` — raggruppa da IRIS follow-up
- `trovaDuplicati(collection)` — integrità dataset
- `statoSuite()` — health check consolidato per dashboard

**Interagisce con**
Esce verso TUTTI con notifiche. Primo fruitore: ECHO (briefing
mattutino), IRIS (segnala anomalie email).

---

## 9. CALLIOPE — Il Content / Comunicazione in uscita (opzionale)

**Dominio**
Output scritto: risposte email, comunicazioni ai condomini, preventivi,
newsletter tecnici, post LinkedIn aziendale. È il "ghostwriter" del
gruppo.

**App toccate**
GRAPH (template PDF), COSMINA (`crm_clienti` per mailing), Diogene
(frontend ack), IRIS (risposte suggerite — il "F7" bloccato da Blaze
vivrebbe qui come Collega autonomo).

**Azioni**
- `bozzaRisposta(emailId, tono, contesto)`
- `comunicazioneCondominio(condominioId, motivo, dati)`
- `preventivoFormale(impiantoId, lavoro)` — da template + listino
- `newsletterTecnici(mese)` — riepilogo per il team
- `rispostaPECtono(pecId)` — su richiesta di DIKEA
- `lettereSollecito(clienteId)` — su richiesta di CHARTA
- `trascriviRiunione(audio)` — con Whisper

**Interagisce con**
IRIS, CHARTA, DIKEA come clienti principali; ECHO per dettatura;
usa MEMO per conoscere il destinatario.

---

## Altri nomi candidati (non inclusi nei 9)

- **ATLANTE** — reggerebbe infrastruttura/DevOps (deploy, monitoring
  tecnico). L'ho fuso dentro PHARO in questa proposta perché per
  l'azienda vale come uno. Scorporalo se e quando l'infra cresce.
- **MORFEO** — automazione notturna / batch (backup, sync worker,
  scraping CURIT di massa). Di fatto è un modo di operare, non un
  Collega con dominio proprio. Può essere un "aspetto" di PHARO.
- **DEMETRA** — "coltivatore" clienti: onboarding, upsell,
  fidelizzazione (CRM sales). Oggi la suite non fa sales attivo, quindi
  è prematuro. Candidato per v0.3 quando partirà la parte commerciale.

---

## Grafo sintetico delle relazioni

```
                        ┌────────────┐
                        │    ECHO    │ (voce, chat, I/O)
                        └──────┬─────┘
                               │
      ┌────────────┐    ┌──────┴─────┐    ┌────────────┐
      │    IRIS    │◀──▶│  LAVAGNA   │◀──▶│   PHARO    │
      │   email    │    │   (bus)    │    │  watcher   │
      └──────┬─────┘    └──────┬─────┘    └────────────┘
             │                 │
             ▼                 ▼
      ┌────────────┐    ┌────────────┐    ┌────────────┐
      │    ARES    │◀──▶│  CHRONOS   │    │    MEMO    │
      │  tecnico   │    │   agenda   │    │  storico   │
      └────────────┘    └────────────┘    └──────┬─────┘
                                                 │
      ┌────────────┐    ┌────────────┐    ┌──────┴─────┐
      │   CHARTA   │◀──▶│  EMPORION  │    │   DIKEA    │
      │   soldi    │    │  magazzino │    │   norme    │
      └──────┬─────┘    └────────────┘    └────────────┘
             │
             ▼
      ┌────────────┐                      ┌────────────┐
      │   DELPHI   │                      │  CALLIOPE  │
      │  analisi   │                      │   content  │
      └────────────┘                      └────────────┘
```

---

## Ordine di implementazione suggerito

**Tier 1** (abilitano tutto il resto):
1. **ARES** — già "cliente" di IRIS via la regola
   `RICHIESTA_INTERVENTO`/`GUASTO_URGENTE` → Lavagna. Va solo
   formalizzato come Collega con UI.
2. **MEMO** — il "contesto cliente" serve a ARES, CHARTA, IRIS.
3. **CHRONOS** — senza agenda ARES non sa schedulare.

**Tier 2** (alto valore operativo):
4. **CHARTA** — liberare Alberto dall'amministrativo è il ROI più alto.
5. **EMPORION** — magazzino è lavoro ripetitivo quotidiano.
6. **PHARO** — inizia come semplice cron + notifica, cresce.

**Tier 3** (quando Tier 1/2 generano dati):
7. **DIKEA** — utile quando le PEC e le DiCo diventano volume.
8. **DELPHI** — ha senso dopo 3-6 mesi di dati puliti.
9. **CALLIOPE** — dipende dallo sblocco del piano Blaze (F7).

**Principio**: ogni Collega aggiunto deve ridurre il numero di volte al
giorno in cui Alberto apre COSMINA manualmente. Misura quella frequenza
prima e dopo — è la tua eval.
