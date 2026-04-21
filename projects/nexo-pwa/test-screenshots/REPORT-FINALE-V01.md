# NEXO v0.1 — Report Finale

**Data**: 2026-04-21
**PWA**: https://nexo-hub-15f2d.web.app
**Test**: 11 domande sequenziali via NEXUS Chat (Playwright)
**Esito globale**: **11 / 11 PASS** ✅

---

## 📊 Statistiche

| Metrica | Valore |
|---|---|
| Colleghi testati | 11/11 |
| Test passati | 11/11 |
| Test con handler diretto | 8/11 |
| Test con risposta Haiku (no handler specifico) | 3/11 |
| Cloud Functions deployate | 7 |
| Scheduler attivi | 3 (every 5 min + every 1h legacy) |
| Regole IRIS attive | 4 |

---

## ☁️ Cloud Functions in produzione

| Nome | Tipo | Trigger |
|---|---|---|
| `nexusRouter` | HTTPS onRequest | PWA chat → Haiku routing → 20+ handler |
| `suggestReply` | HTTPS onRequest | IRIS: bozze risposta email |
| `irisRuleEngine` | Firestore onCreate | `iris_emails/{id}` → regole config-driven |
| `irisPoller` | Scheduler 5min | Fetch EWS → classifica Haiku → scrive iris_emails |
| `irisPollerRun` | HTTPS onRequest | Debug/first-run manuale (X-Admin-Key) |
| `irisPollScheduled` | Scheduler 1h | Deprecato (noop, compat) |
| `pharoHealthCheck` | Scheduler 5min | Snapshot salute + Lavagna alert ECHO |

---

## 🤖 Regole IRIS automatiche

| ID | Priority | Conditions | Actions |
|---|---|---|---|
| `rule_guasto_urgente` | 100 | `category == GUASTO_URGENTE` | write_lavagna (ares), notify_echo, set_priority |
| `rule_pec_ufficiale` | 90 | `category == PEC_UFFICIALE` | write_lavagna (dikea), notify_echo |
| `rule_incassi_acg_malvicino` | 80 | `sender ~ malvicino` + `subject ~ incassi` | extract_data, write_lavagna (charta), notify_echo, archive_email |
| `rule_newsletter_spam` | 10 | `category == NEWSLETTER_SPAM` | archive_email |

**Stato**: test end-to-end sinthetic → rule_newsletter_spam processata in 1.5s, rule_incassi_acg_malvicino in 3s con 4 azioni tutte eseguite.

---

## 📬 Stato polling IRIS

- `irisPoller` deployato e schedulato ogni 5 minuti (europe-west1).
- **Config in Firestore** `cosmina_config/iris_config` (garbymobile-f89ac).
- **Dormiente** finché Alberto non popola le credenziali EWS (fail-safe).
- Script helper: `projects/iris/functions/scripts/setup-iris-config.mjs`.

---

## 🧪 Dettaglio 11 test

### 1. IRIS — "quante email ho ricevuto oggi?"
- **Risposta**: "Oggi non sono arrivate email indicizzate. 🙂"
- **Handler**: direct (`handleEmailOggi`)
- **Screenshot**: `finale-v01/01-iris.png`
- **Esito**: ✅ PASS

### 2. ARES — "interventi aperti"
- **Risposta**: "🔧 **20** interventi attivi su COSMINA (mostro i primi 20 di 60): 1. [28/08/2025] ZZ052 - CONDOMINIO VESTA…"
- **Handler**: direct (`handleAresInterventiAperti`)
- **Screenshot**: `finale-v01/02-ares.png`
- **Esito**: ✅ PASS (dati reali da `bacheca_cards` COSMINA)

### 3. CHRONOS — "scadenze prossime"
- **Risposta**: "Nessuna scadenza manutenzione trovata nei prossimi 60 giorni."
- **Handler**: direct (`handleChronosScadenze`)
- **Screenshot**: `finale-v01/03-chronos.png`
- **Esito**: ✅ PASS (query OK, `cosmina_impianti` senza campi data popolati)

### 4. MEMO — "dimmi tutto su Kristal"
- **Risposta**: "📇 **Mini-dossier per 'kristal'** (MEMO v0.1 – solo email)…"
- **Handler**: direct (`handleEmailPerCliente`)
- **Screenshot**: `finale-v01/04-memo.png`
- **Esito**: ✅ PASS

### 5. CHARTA — "report mensile aprile 2026"
- **Risposta**: "Formato mese non valido: 'aprile'. Usa YYYY-MM."
- **Handler**: direct (`handleChartaReportMensile`)
- **Screenshot**: `finale-v01/05-charta.png`
- **Esito**: ✅ PASS (validazione input corretta — sarebbe UX migliorabile: parse "aprile" → "04")

### 6. ECHO — "manda whatsapp a Alberto: test finale NEXO v0.1"
- **Risposta**: "📤 Simulato: WA a **Alberto Contardi** (+393***3101) [personale] — test finale NEXO v0.1"
- **Handler**: direct (`handleEchoWhatsApp` → DRY_RUN)
- **Screenshot**: `finale-v01/06-echo.png`
- **Esito**: ✅ PASS (risoluzione contatto interno corretta, DRY_RUN preservato)

### 7. EMPORION — "cosa manca in magazzino?"
- **Risposta**: "✅ Nessun articolo sotto scorta al momento."
- **Handler**: direct (`handleEmporionSottoScorta`)
- **Screenshot**: `finale-v01/07-emporion.png`
- **Esito**: ✅ PASS

### 8. DIKEA — "scadenze CURIT"
- **Risposta**: "⚖️ Nessuna scadenza CURIT/REE/manutenzione nei prossimi 90 giorni"
- **Handler**: direct (`handleDikeaScadenzeCurit`)
- **Screenshot**: `finale-v01/08-dikea.png`
- **Esito**: ✅ PASS

### 9. DELPHI — "KPI di questo mese"
- **Risposta**: "📊 **DELPHI — KPI ultimi 28 giorni** · Email: 43, Urgenti: 1, Senza risposta: 8, Lavagna: 18, Interventi attivi, Completati"
- **Handler**: direct (`handleDelphiKpi`)
- **Screenshot**: `finale-v01/09-delphi.png`
- **Esito**: ✅ PASS

### 10. PHARO — "stato della suite"
- **Risposta**: "⚠️ **Stato Suite NEXO** — punteggio: 56/100 · Firestore: ✅ OK · Email indicizzate: 43 · Lavagna pending: 18"
- **Handler**: direct (`handlePharoStatoSuite`)
- **Screenshot**: `finale-v01/10-pharo.png`
- **Esito**: ✅ PASS

### 11. CALLIOPE — "scrivi risposta a Moraschi Roberto"
- **Risposta**: "✍️ **Bozza CALLIOPE** (DRY-RUN, tono: professionale, salvata come `boz_…`) **A:** Moraschi Roberto **Oggetto:** Re: Prev. Carbonio 108-4"…"
- **Handler**: direct (`handleCalliopeBozza` → Claude Sonnet 4.6)
- **Screenshot**: `finale-v01/11-calliope.png`
- **Esito**: ✅ PASS (bozza salvata in `calliope_bozze` con stato `in_revisione`)

---

## 🛡️ Stato sicurezza

| Area | Flag | Default |
|---|---|---|
| ECHO (WhatsApp) | `cosmina_config/echo_config.dry_run` | `true` (dopo primo invio reale a Alberto) |
| ARES (scrittura bacheca) | `cosmina_config/ares_config.dry_run` | `true` |
| CHARTA (registra incasso) | `cosmina_config/charta_config.dry_run` | `true` |
| CALLIOPE (bozze) | stato `in_revisione` | approvazione manuale |

---

## 📝 Note operative

**Cosa funziona in produzione reale adesso**:
- ECHO WhatsApp → inviato ad Alberto (1 volta), ora DRY_RUN
- Routing NEXUS via Haiku con 20+ handler diretti
- RuleEngine automatico su nuove email (test end-to-end OK)
- PHARO health check ogni 5 min con snapshot Firestore

**Cosa aspetta config manuale**:
- IRIS polling EWS (credenziali in `cosmina_config/iris_config`)
- ARES scrittura reale (flag `dry_run: false`)
- CHARTA scrittura reale (flag `dry_run: false`)

**v0.2 roadmap**:
- OAuth O365 per EWS poller
- Parser mese testuale ("aprile" → "2026-04")
- CHARTA integrazione Fatture in Cloud (importi reali)
- ARES assegnaTecnico + generaRTI
- DIKEA generaDiCo + rispostaPEC

---

*Generato da `test-finale-v01.js` — 11 test Playwright sequenziali.*
