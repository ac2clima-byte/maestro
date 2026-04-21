Implementa TUTTO il restante per NEXO v0.1. Fai tutto in sequenza senza fermarti.

## 1. ARES — Scrittura reale su COSMINA (DRY_RUN default)

- Implementa apriIntervento che SCRIVE realmente su COSMINA (collection corretta per interventi)
- DRY_RUN=true di default: in dry-run, logga cosa avrebbe scritto senza scrivere
- Aggiorna nexusRouter: "apri intervento caldaia Kristal urgente" → crea in COSMINA
- Aggiorna la dashboard ARES nella PWA: mostra interventi aperti reali

## 2. Polling IRIS 24/7 — Cloud Function schedulata

- Crea una Cloud Function schedulata (Cloud Scheduler) che ogni 5 minuti:
  a. Chiama il poller EWS (exchangelib) per nuove email
  b. Classifica con Haiku
  c. Salva in Firestore iris_emails
  d. Esegue le regole (RuleEngine)
- Usa le credenziali EWS da Secret Manager (non .env)
- Se le credenziali EWS non sono in Secret Manager, usa quelle dal file .env locale per ora
- Deploy: firebase deploy --only functions

## 3. Motore regole IRIS — Flusso incassi automatico

- Implementa la regola "Incassi ACG":
  - Trigger: mittente contiene "malvicino" AND oggetto contiene "INCASSI"
  - Azioni: estrai incassi dal corpo email → scrivi Lavagna per CHARTA → scrivi Lavagna per ECHO (WA ad Alberto con riassunto incassi)
- Implementa la regola "Guasto urgente":
  - Trigger: categoria == GUASTO_URGENTE
  - Azioni: scrivi Lavagna per ARES → scrivi Lavagna per ECHO (WA urgente ad Alberto)
- Testa le regole con le email esistenti in Firestore

## 4. CHRONOS — Scadenze reali

- Implementa scadenzeProssime: leggi cosmina_impianti e trova impianti con prossima_scadenza nei prossimi 60 giorni
- Implementa agendaGiornaliera: leggi interventi pianificati per tecnico e data da COSMINA
- Aggiorna nexusRouter con handler reali
- Aggiorna dashboard CHRONOS nella PWA

## 5. CHARTA — Fatture reali

- Implementa registraIncasso con scrittura su Firestore charta_pagamenti
- Implementa estraiIncassiDaEmail: parsing del corpo email per estrarre importi e clienti
- Aggiorna nexusRouter: "registra incasso 500 euro da Condominio Kristal" → salva
- Aggiorna dashboard CHARTA nella PWA

## 6. EMPORION — Magazzino reale

- Implementa disponibilita: leggi da COSMINA collection magazzino (se esiste)
- Implementa articoliSottoScorta
- Aggiorna nexusRouter con handler reali

## 7. DIKEA — Scadenze normative reali

- Implementa scadenzeCURIT: leggi cosmina_impianti_cit
- Implementa impiantiSenzaTarga
- Aggiorna nexusRouter

## 8. DELPHI — KPI reali

- Implementa kpiDashboard: aggregazione da iris_emails + COSMINA interventi
- Implementa costoAI: leggi da cosmina_config/ai_usage
- Implementa confrontoMeseSuMese
- Aggiorna nexusRouter

## 9. PHARO — Monitoring reale

- Implementa statoSuite: ping Cloud Functions, controlla heartbeat
- Implementa budgetAnthropic: leggi costi da cosmina_config/ai_usage
- Implementa impiantiOrfani
- Implementa eseguiControlliPeriodici come Cloud Function schedulata ogni 5 minuti
- Se trova problemi → scrivi Lavagna per ECHO

## 10. CALLIOPE — Bozze reali

- Implementa bozzaRisposta: usa Claude Sonnet per generare bozze email
- Integra con NEXUS: "scrivi risposta a Moraschi" → Sonnet genera bozza → mostra in chat
- Salva bozze in calliope_bozze

## 11. Deploy finale + Test completo

- Rideploya TUTTO: functions + hosting + rules
- Testa con Playwright TUTTI i Colleghi (1 domanda per Collega, 11 test)
- Screenshot + report testuale per ogni test
- Analizza gli screenshot e scrivi il report completo

## Regole generali:
- DRY_RUN=true per TUTTE le scritture su COSMINA e invii WA
- Letture sempre reali
- Se una collection non esiste, stampalo e vai avanti
- Se un'API non è raggiungibile, stampalo e vai avanti
- NON fermarti a chiedere conferme — sei in auto mode
- Committa frequentemente (ogni 2-3 Colleghi)
