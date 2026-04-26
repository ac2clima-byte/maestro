# Analisi dev-request Wj9dqUBkAhD6J3ttcWwh

**Origine:** bottone globale "Segnala bug" (top-right PWA — `source: report_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** (n/a) ma il bug si riferisce a sessione `nx_3zos89rjmog8a425`.
**Data:** 2026-04-26 21:01 UTC
**Type:** `generic`
**Richiesta:** "Non crea interventi"

> Tracciato manualmente: la sessione NEXUS interessata è `nx_3zos89rjmog8a425`,
> con 14 messaggi tra le 20:36 e le 20:59 UTC, conclusa con 2 conferme di
> Alberto a interventi che non sono mai arrivati su bacheca COSMINA.

## Conversazione segnalata (ricostruita da nexus_chat)

| ts | ruolo | content / dettaglio |
|---|---|---|
| 20:36:17 | ALBERTO | "Che interventi ha Federico domani" |
| 20:36:22 | NEXUS (ares/interventi_aperti) | "Federico domani non ha interventi (cercato 274 card, filtro data domani, solo aperti)." |
| 20:36:42 | ALBERTO | "E giovedì scorso che interventi aveva" |
| 20:36:46 | NEXUS (ares/interventi_aperti) | "Federico giovedì 23/04/2026 ha avuto un intervento: DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA, stato chiuso (co-assegnato a DAVID)." ✓ |
| 20:37:54 | ALBERTO | "**Devi duplicare l'intervento, ci devono andare anche domani**" |
| 20:37:57 | NEXUS (ares/crea_intervento) | "Creo un intervento per FEDERICO, **lunedì 27/04/2026** alle 09:00, presso VIA TOSCANINI ALESSANDRIA: dare il bianco. (DRY_RUN, conferma)" — preview corretto ✓ |
| 20:38:50 | ALBERTO | "Devo darti conferma?" |
| 20:38:53 | NEXUS (ares/crea_intervento) | preview RICALCOLATO con `parametri.data="lunedì"` → "**lunedì 20/04/2026**" — DATA SBAGLIATA (passato) ✗ |
| 20:39:09 | ALBERTO | "Confermo" |
| 20:39:10 | NEXUS (ares_conferma) | "Simulato (DRY_RUN): FEDERICO, lunedì 20/04/2026 alle 09:00, presso VIA TOSCANINI ALESSANDRIA: dare il bianco. ID locale int_xxx. Per scrivere davvero su COSMINA imposta cosmina_config/ares_config.dry_run=false." |
| 20:59:22 | ALBERTO | "Lo ha fissato?" |
| 20:59:27 | NEXUS (ares/crea_intervento) | preview RIRICALCOLATO — di nuovo "**lunedì 20/04/2026**" ✗ |
| 20:59:44 | ALBERTO | "Confermo" |
| 20:59:45 | NEXUS (ares_conferma) | seconda simulazione DRY_RUN, sempre 20/04. |

Da quel momento Alberto va al bottone globale e scrive "**Non crea interventi**". Letteralmente vero: nulla è arrivato su `bacheca_cards` di COSMINA.

## Verifica DRY_RUN

`cosmina_config/ares_config` **NON ESISTE** su `garbymobile-f89ac`. La funzione `isAresDryRun()` (`ares.js:491-499`):
```js
async function isAresDryRun() {
  try {
    const snap = await getCosminaDb().collection("cosmina_config").doc("ares_config").get();
    if (snap.exists && typeof (snap.data() || {}).dry_run === "boolean") {
      return snap.data().dry_run;
    }
  } catch {}
  return true;  // ← default true
}
```

Default `true`. Quindi DRY_RUN sempre attivo, nessuna scrittura su COSMINA. **Bug evidente: "Confermo" di Alberto non produce mai un intervento reale.** Il messaggio tecnico "Per scrivere davvero su COSMINA imposta cosmina_config/ares_config.dry_run=false" non è azionabile da Alberto.

## Diagnosi — 8 bug nello stesso flusso

### Bug A — domande di Alberto vengono interpretate come comandi crea_intervento
"Devo darti conferma?" e "Lo ha fissato?" sono **domande**, non comandi. Haiku le classifica come `ares/crea_intervento` perché c'è un pending nel contesto e copia i parametri. Risultato: ogni domanda dell'utente fa rieseguire `handleAresCreaIntervento` che ricalcola pending → output preview cambia (anche in peggio).

Il system prompt non ha una regola "se hai un pending già creato e l'utente fa una domanda → rispondi a parole, non rieseguire crea_intervento".

### Bug B — parametri data instabili tra turni
Turno 1: `parametri.data="domani"` → handler dà 27/04 ✓.
Turno 2: `parametri.data="lunedì"` → handler dà 20/04 ✗ (vedi Bug C, D).
Turno 3: `parametri.data="lunedì 27/04/2026"` → handler dà 20/04 ✗ (vedi Bug C).

Haiku riformula il valore di `data` ogni volta basandosi sul testo letterale dell'ultimo messaggio. Senza pending strutturato che venga ripreso pari pari.

### Bug C — precedenza parser data: giorno-settimana batte data-assoluta
`projects/iris/functions/handlers/ares.js:38-117` (`parseRangeDataInterventi`):
- Riga 65-90: loop `for (const [name, idx] of Object.entries(GIORNI_SETTIMANA))` — match prima.
- Riga 92-105: data assoluta `\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b` — match dopo.

Su input "lunedì 27/04/2026", il parser matcha **"lunedì"** prima di considerare "27/04/2026". Ritorna lunedì 20/04 (passato) ignorando la data assoluta che era esplicitamente fornita.

### Bug D — tense default per giorno settimana = passato
Stesso file, riga 75-87:
```js
const wantPast = /\bscors[oa]\b/.test(m) || (_tense(m) === "past" && !/\bprossim[oa]\b/.test(m));
const wantFuture = /\bprossim[oa]\b/.test(m) || _tense(m) === "future";
const todayDow = today.getDay();
let delta;
if (wantPast) { delta = -((todayDow - idx + 7) % 7 || 7); }
else if (wantFuture) { delta = (idx - todayDow + 7) % 7 || 7; }
else { delta = -((todayDow - idx + 7) % 7); /* default = passato più recente */ }
```

Default = passato più recente (eccetto se `_tense` esplicito future). Per "lunedì" senza altro contesto, dà lunedì 20/04. Ma in **scenario di crea_intervento** la semantica è quasi sempre futura.

### Bug E — pending viene sovrascritto a ogni preview
`ares.js:handleAresCreaIntervento` chiama:
```js
await db.collection("nexo_ares_pending").doc(sessionId).set(pending, { merge: true });
```

`merge: true` aggiorna i campi passati. Ad ogni nuova chiamata `due` viene sovrascritto con il NUOVO calcolo. Distrugge il valore corretto del primo turno.

### Bug F — David non ereditato come co-tecnico
La query precedente (turno 4) aveva ritornato `tecnico: "DAVID + FEDERICO"` (`techNames` originale = `["DAVID","FEDERICO"]`). Al turno 5 Alberto dice "**ci devono andare anche** domani" — "ci" = al condominio, "anche" = oltre alla volta scorsa. Haiku copia solo `tecnici=["FEDERICO"]` (perché Federico era il tecnico filtrato della query). Manca trasporto di `techNames[]` originale.

### Bug G — pattern conferma non riconosce "Devo darti conferma?"
`tryInterceptAresConfermaIntervento` quickcheck:
```js
if (!/^\s*(s[iì](?:\s|$|[,.!?])|ok|va\s+bene|conferm|procedi|manda|invia|fallo|crealo|fai\s|fai$|pubblica|annull|no(?:\s|$|[,.!?])|cancell|stop|basta)/i.test(t)) return null;
```

"Devo darti conferma?" inizia con "Devo" — **non matcha** alcuno dei trigger. Quindi l'intercept NON scatta, la frase passa al routing standard, Haiku la classifica come `crea_intervento` (vedi Bug A) e rieseguiamo il preview.

### Bug H — DRY_RUN attivo di default + messaggio tecnico
`ares_config` non esiste → `isAresDryRun()` ritorna `true`. Tutte le `Confermo` di Alberto producono solo simulazioni nel mirror locale `ares_interventi` (collection su `nexo-hub-15f2d`, non su `bacheca_cards` COSMINA).

Il messaggio tecnico "Per scrivere davvero su COSMINA imposta cosmina_config/ares_config.dry_run=false" non è azionabile da Alberto: è un comando da console Firebase. Alberto non sa di doverlo fare.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 38-117 | `parseRangeDataInterventi`: precedenza giorno-settimana > data-assoluta (Bug C); tense default = past (Bug D) |
| `projects/iris/functions/handlers/ares.js` | 491-499 | `isAresDryRun`: default `true` se config manca (Bug H) |
| `projects/iris/functions/handlers/ares.js` | 691-744 | `handleAresCreaIntervento`: pending sovrascritto con merge (Bug E), tecnici da array senza ereditare techNames precedenti (Bug F) |
| `projects/iris/functions/handlers/ares.js` | 768-790 | `tryInterceptAresConfermaIntervento` quickcheck: regex non matcha "Devo darti conferma?" (Bug G) |
| `projects/iris/functions/handlers/nexus.js` | 105-145 | system prompt ARES: nessuna istruzione "se pending esiste e domanda è di chiarimento → NON rieseguire crea_intervento" (Bug A) |
| `projects/iris/functions/handlers/nexus.js` | 192-211 | sezione "USO DEL CONTESTO CONVERSAZIONALE": non specifica come ripescare pending strutturato (Bug B) |
| `projects/iris/functions/handlers/nexus.js` | 442-450 | DIRECT_HANDLER `crea_intervento`: non guarda esistenza pending |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Detect "domanda su pending esistente" → NON rieseguire crea_intervento (M, critica)
**Dove:** `tryInterceptAresConfermaIntervento` o nuovo intercept dedicato.
**Cosa fa:** prima del routing standard, se per la sessione c'è un pending `nexo_ares_pending/{sessionId}` con `kind="ares_crea_intervento"` E il messaggio dell'utente è una domanda (`?` finale, oppure inizia con "devo/cosa/come/dove/quando/lo ha/è stato/hai/puoi"):
- NON rieseguire `handleAresCreaIntervento`.
- Rispondi a parole con stato del pending: "Sì, il riepilogo è ancora valido: [tecnici, data, condominio]. Per pubblicare scrivi 'sì' o 'conferma'."
- Mantieni il pending intatto.

```js
const isQuestion = /[?]\s*$/.test(t) || /^\s*(devo|cosa|come|dove|quando|lo\s+ha|è\s+stato|hai\s|puoi\s|allora\b|ok\?)/i.test(t);
if (isQuestion && pendingExists) {
  return {
    content: `Sì, il riepilogo è ancora valido: ${_riepilogoCrea(pendingData)}. Per pubblicare scrivi "sì" o "conferma", per cambiare dimmi cosa, per annullare scrivi "annulla".`,
    _aresConfermaHandled: true,
  };
}
```

**Perché:** elimina la classe di bug "ogni domanda riproduce il preview ricalcolato male".

### 2) Inverti precedenza parser data: data-assoluta > giorno-settimana (S)
**Dove:** `ares.js:parseRangeDataInterventi`.
**Cosa fa:** sposta il match `\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b` PRIMA del loop sui giorni della settimana. Se c'è "27/04/2026" lo prendiamo subito, non importa se nella stringa c'è anche "lunedì".

```js
// Data assoluta DD/MM[/YYYY] — priorità ALTA
const ass = m.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
if (ass) {
  const dd = Number(ass[1]), mm = Number(ass[2]);
  let yy = ass[3] ? Number(ass[3]) : today.getFullYear();
  if (yy < 100) yy += 2000;
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
    const d = new Date(yy, mm - 1, dd, 0, 0, 0, 0);
    return { from: d, to: _addDays(d, 1), label: `il ${_formatDateIt(d)}` };
  }
}

// "il 23 aprile" / "23 aprile [2025]" — priorità MEDIO-ALTA
const meseAbs = m.match(/...);
if (meseAbs) { ... return ... }

// Giorno settimana — solo se NON c'è già una data esplicita
for (const [name, idx] of Object.entries(GIORNI_SETTIMANA)) { ... }
```

**Perché:** quando l'utente o Haiku passano "lunedì 27/04/2026", la data esplicita vince.

### 3) Tense default per giorno-settimana in scenario crea_intervento = future (S)
**Dove:** chiamate a `parseRangeDataInterventi` da `_parseDataOra`.
**Cosa fa:** quando il parsing avviene per `crea_intervento`, passa un flag `prefer="future"`:
```js
function parseRangeDataInterventi(text, opts = {}) {
  const prefer = opts.prefer || null;  // "future" | "past" | null
  ...
  // Default ambiguo: usa prefer se fornito
  else {
    if (prefer === "future") delta = ((idx - todayDow + 7) % 7) || 7;
    else /* default past */ delta = -((todayDow - idx + 7) % 7);
  }
}
```

E `_parseDataOra(userMessage, parametri)` chiama `parseRangeDataInterventi(text, { prefer: "future" })` perché un crea_intervento è quasi sempre futuro.

**Perché:** allinea il default semantico al contesto d'uso.

### 4) Pending: NON sovrascrivere `due` se è valido e l'input ne ricalcola uno passato (S)
**Dove:** `handleAresCreaIntervento`, prima del `set` pending.
**Cosa fa:**
```js
const existing = (await db.collection("nexo_ares_pending").doc(sessionId).get().catch(()=>null))?.data();
if (existing && existing.due && due && new Date(due) < _midnight(new Date())) {
  // Nuovo due è passato e c'è già un pending con data futura → tieni quello
  due = new Date(existing.due);
}
```

**Perché:** difesa in profondità contro la regressione data passata. Anche se Bug C/D non sono fixati, almeno il pending non si "rovina" tra un turno e l'altro.

### 5) Pattern conferma più permissivo (S)
**Dove:** `tryInterceptAresConfermaIntervento` quickcheck.
**Cosa fa:** allargare per matchare "Devo darti conferma?", "Confermo", "vuoi che confermo?", "ti dico sì":
```js
if (!/(s[iì](?:\s|$|[,.!?])|ok|va\s+bene|conferm|procedi|manda|invia|fallo|crealo|fai\s|fai$|pubblica|annull|no(?:\s|$|[,.!?])|cancell|stop|basta)/i.test(t)) return null;
// (rimosso ^\s* per matchare la parola anche in mezzo, ma poi richiede pending presente)
```

E aggiungere "**vuoi che confermo**", "**dico sì**", "**è la stessa**" → considerati conferma.

**Perché:** "Devo darti conferma?" è una domanda **sul flusso conferma stesso**: gestirla come "sì? procedo?" è ragionevole.

### 6) Trasporto contesto: tecnici dal turno query precedente (M)
**Dove:** `_extractTecniciCrea` o nuovo helper.
**Cosa fa:** se l'utente dice "ci devono andare", "loro", "lui", "anche [Nome]", e c'è un messaggio assistant precedente con `direct.data.items[].techNames`, **eredita** quei tecnici.

```js
// 5. Eredita da contesto chat precedente quando ci/loro/anche pronominale
if (sessionId && /\b(ci\s+devono|loro\s+devono|anche\s+\w|li\s+m|li\s+pi)\b/i.test(m)) {
  const ctxTechs = await _readLastQueryTechNames(sessionId);
  for (const t of ctxTechs) out.add(t.toUpperCase());
}
```

**Perché:** "ci devono andare anche domani" = entrambi quelli dell'intervento di giovedì. Senza questo, perdiamo David.

### 7) Risposta conferma con linguaggio non-tecnico (S)
**Dove:** `tryInterceptAresConfermaIntervento` (branch DRY_RUN).
**Cosa fa:** sostituire "Per scrivere davvero su COSMINA imposta cosmina_config/ares_config.dry_run=false" con qualcosa di azionabile per Alberto:
> "Ho preparato l'intervento ma ARES è in modalità sicurezza (DRY_RUN). Per attivare la scrittura reale sulla bacheca COSMINA serve disattivare la sicurezza una volta sola — vuoi che lo faccia ora?"

E se Alberto dice sì, il sistema aggiorna `cosmina_config/ares_config.dry_run=false` (richiede permessi cross-progetto, già configurati per ARES).

**Perché:** Alberto non sa cosa è "DRY_RUN", non apre la console Firebase. Lui dice "non crea interventi" — letteralmente vero ma con causa nascosta.

### 8) System prompt: regola "se pending esiste, non riprodurre" (S)
**Dove:** `nexus.js:105-145`.
**Cosa fa:** aggiungere:
```
IMPORTANTE — Pending intervento: se nei messaggi precedenti hai
proposto un intervento "Creo un intervento per ..." e l'utente non
ha ancora confermato/annullato esplicitamente, considera quel pending
come ATTIVO. Le sue domande successive ("Devo darti conferma?", "Lo
hai fissato?", "L'hai messo?") NON sono nuovi comandi crea_intervento:
sono richieste di stato. Rispondi con collega="nessuno" + reasoning
"pending già attivo, in attesa conferma" e l'handler ARES intercept
gestirà la risposta.
```

**Perché:** istruisce Haiku a non riproporre il preview a ogni domanda.

### 9) Logging diagnostico più dettagliato (S)
**Dove:** `ares.js:handleAresCreaIntervento`.
**Cosa fa:** log strutturato per ogni invocazione:
```js
logger.info("[ARES] crea_intervento invocato", {
  sessionId,
  pendingExists: !!existingPending,
  parametri,
  parsedTecnici: tecnici,
  parsedDue: due ? due.toISOString() : null,
  parsedCondominio: cond,
});
```

**Perché:** la prossima volta che il bug si manifesta, abbiamo telemetria immediata.

### 10) Test E2E del flusso completo turno-1-conferma (M)
**Dove:** nuovo `projects/iris/test-ares-crea-conferma-flow.mjs`.
**Casi:**
1. T1 query "Federico domani" → 0 risultati ✓.
2. T2 "E giovedì scorso" → 1 intervento Via Toscanini (Federico+David).
3. T3 "Devi duplicare l'intervento, ci devono andare anche domani" → preview con tecnici=[FEDERICO,DAVID], data=27/04.
4. T4 "Devo darti conferma?" → risposta a parole con riepilogo, **stesso pending**.
5. T5 "Confermo" → scrittura DRY_RUN o reale.

## Rischi e alternative

### R1 — Detect "domanda" troppo aggressiva
"Confermo" potrebbe essere preceduto da "Sì, confermo" o "Confermo che…" — il regex deve essere più permissivo. Mitigazione: priorità alla parola "confermo/conferma" presente ovunque nel testo, anche in domanda.

### R2 — DRY_RUN automatico sembra sicuro ma confonde Alberto
Disattivarlo via Cloud Function richiede esplicita autorizzazione. Mitigazione: aggiungere comando NEXUS "**ARES dry-run on/off**" che scrive il config Firestore e dà feedback chiaro. Solo l'utente Alberto può farlo (filtro userId).

### R3 — Tecnici ereditati possono essere troppi
Se la query precedente aveva 3 tecnici co-assegnati, "anche" Mario li eredita tutti? Non sempre desiderato. Mitigazione: chiedi conferma "Ho ereditato Federico e David dal contesto precedente. Confermi entrambi o solo uno?".

### R4 — Inversione parser data può rompere altri flow
Se un altro handler usa `parseRangeDataInterventi("lunedì scorso")` aspettandosi sempre passato, l'inversione di precedenza non lo rompe. Ma il flag `prefer="future"` solo per crea_intervento sì. Sicuro.

### R5 — Pending atomico
Se due turni rapidi (Alberto preme Invio veloce) generano due `set(pending)` quasi contemporanei, il merge può perdere campi. Mitigazione: `transaction` Firestore per il pending (pesante per il caso) o `set` non-merge che riscrive tutto.

### Alternative scartate

- **A1: chiedere ad Alberto di scrivere "fai così" / "vai" invece di "Confermo"**: cambia abitudine, non scala.
- **A2: spegnere DRY_RUN di default**: rischio scritture errate. Bocciato — meglio fixare il flusso e tenere DRY_RUN come safety net.
- **A3: refactor verso state machine pending → conferma → done**: ottima soluzione ma M-L. Per ora applichiamo le 9 patch sopra.

## Effort stimato

**Totale: M (medium)** — 3-4 ore. **Critica**, perché Alberto sta abbandonando.

| Step | Effort |
|---|---|
| 1) detect domanda su pending → no rieseguire | M — 60' |
| 2) precedenza parser data assoluta > giorno-settimana | S — 20' |
| 3) tense `prefer=future` in crea_intervento | S — 20' |
| 4) pending guard: non sovrascrivere due con valore peggiore | S — 30' |
| 5) pattern conferma più permissivo | S — 15' |
| 6) ereditare techNames dal contesto precedente | M — 45' |
| 7) messaggio DRY_RUN azionabile | S — 30' |
| 8) system prompt pending attivo | S — 15' |
| 9) logging diagnostico | S — 15' |
| 10) test E2E flow completo | M — 45' |
| Deploy + email + commit | S — 15' |

## Test di accettazione

1. **Sequenza Alberto integrale:** T1-T5 sopra → al T5 ("Confermo") l'intervento è creato (o simulato se DRY_RUN) con data **27/04 corretta** e tecnici **FEDERICO+DAVID**.
2. **Domanda intermedia non rovina:** T4 "Devo darti conferma?" → risposta a parole, pending **invariato** (stessa data, stessi tecnici).
3. **Data assoluta vince:** "metti intervento lunedì 27/04/2026" → preview con 27/04 (assoluta) anche se "lunedì" da solo darebbe 20/04.
4. **DRY_RUN spiegato:** Alberto chiede "lo ha fissato?" → risposta in italiano semplice "Sì, ho preparato l'intervento ma è in modalità sicurezza. Vuoi che attivi la scrittura reale?".
5. **Eredità tecnici:** dopo query con co-assegnato DAVID+FEDERICO, "ci devono andare anche domani" → preview con entrambi.

## Nota operativa

Alberto sta segnalando il bug dal canale "Segnala bug" globale (no session) probabilmente perché ha **chiuso e riaperto la chat NEXUS** dopo la frustrazione. Un'altra possibilità: il bottone 🐛 in chat era nascosto da qualche regression visiva (il deploy precedente del bottone bug in chat può aver avuto cache stale). Da verificare con la PWA in produzione (cache buster v06/v07).

Inoltre: la **fix di crea_intervento** (commit `0b3365a`, ~22 minuti prima di questa segnalazione) era **deployata e funzionante per il caso "metti intervento a Federico domani"**, ma rivela ora i bug del **flusso post-preview**. Quindi non è una regressione del fix, è la **prima volta** che Alberto prova il flusso completo con conferma e domande di chiarimento.
