# Analisi dev-request yHUxbPNqaLIjH8Uwf1yj

**Origine:** bottone 🐛 in chat NEXUS (`source: nexus_chat_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** `nx_3s3pm8comohew1ev`
**Data:** 2026-04-27 16:45 UTC
**Type:** `bug_from_chat`
**Nota di Alberto:** (nessuna)

## Conversazione segnalata

| ts | ruolo | content |
|---|---|---|
| 16:44:52 | ALBERTO | "METTI UN INTERVENTO A DOMANI MATTINA A VICTOR" |
| 16:44:53 | NEXUS | "Per aprire un intervento mi serve ancora: condominio o indirizzo. Esempio: ..." |
| 16:45:10 | ALBERTO | "residenza le rose per controllo impianto solare" |
| 16:45:11 | NEXUS | "Errore interpretazione: Error: Anthropic 400: ... Your credit balance is too low" |

Alberto ha provato un flow naturale di creazione intervento in 2 turni (luogo + descrizione separati). Il turno 2 fallisce per due motivi diversi sovrapposti.

## Verifica stato sistema

- **Pending Firestore**: `nexo_ares_pending/nx_3s3pm8comohew1ev` → **NON esiste**. Significa che l'handler del turno 1 non ha salvato lo stato parziale (`tecnici=[VICTOR]`, `due=domani 09:00`).
- **Anthropic balance** (turno 2): Cloud Functions log conferma errore 400 "credit balance too low" alla chiamata `callHaikuForIntent`.

## Diagnosi — 3 bug sovrapposti

### Bug A — pending NON salvato quando mancano campi (causa primaria)
`projects/iris/functions/handlers/ares.js:1112-1122`:
```js
const missing = [];
if (!tecnici.length) missing.push("tecnico");
if (!due) missing.push("data");
if (!cond.value) missing.push("condominio o indirizzo");
if (missing.length) {
  return {
    content: `Per aprire un intervento mi serve ancora: ${missing.join(", ")}. ...`,
    data: { pending, missing },
  };  // ← ritorno SENZA salvare pending parziale su Firestore
}

// Salva pending per conferma (anche su FORGE per test E2E)
if (sessionId) {
  await db.collection("nexo_ares_pending").doc(sessionId).set(pending, { merge: true });
}
```

Quando l'handler rileva campi mancanti, **chiede ad Alberto di completare** ma **non persiste lo stato parziale**. Al turno successivo il sistema non ha memoria di:
- VICTOR già identificato come tecnico
- "domani mattina" già parsato come `due=2026-04-28T09:00`

Il turno 2 deve quindi ricostruire TUTTO da zero — ma "residenza le rose per controllo impianto solare" da solo non contiene tecnico né data.

### Bug B — turno 2 non matcha l'intercept di creazione
`projects/iris/functions/handlers/ares.js:isCreaInterventoCommand`:
```js
const VERBO_CREA_RE = /\b(?:crea|crei|cre[oi]|metti|mettigli|...|aggiungi|...)\s+(?:un\s+|gli\s+|...)?(?:intervento|appuntamento|lavoro|visita)/i;
export function isCreaInterventoCommand(userMessage) {
  return VERBO_CREA_RE.test(userMessage);
}
```

"residenza le rose per controllo impianto solare" **non contiene** alcun verbo di creazione. Il regex ritorna `false`. L'intercept PRE-Haiku in `nexusRouter` (`index.js`) e `forge.js` non scatta.

Risultato: il messaggio cade nel routing standard con Haiku → Haiku interpreta che è un follow-up al pending precedente MA il pending non c'è (Bug A) → il modello prova a routare diversamente, ma fallisce per Bug C.

### Bug C — Anthropic API credit balance too low (infrastruttura)
Out of scope dell'handler ARES, ma è la goccia che fa traboccare il vaso. Anche con Bug A e B fixati, se Anthropic non risponde, il fallback Haiku non funziona. Soluzioni di emergenza:
- Verificare e ricaricare balance Anthropic (pannello console.anthropic.com);
- Fallback a Sonnet/altro modello;
- Funzionamento degradato senza Haiku (solo intercept regex).

Il **fix core** è A+B: il sistema NON dovrebbe DIPENDERE da Haiku per completare un intervento parziale. Il pending pattern già esiste per i preventivi (`nexo_preventivi_pending` con stati `attesa_voci`/`attesa_approvazione`/`attesa_iva`/...). Replicarlo per ARES.

### Bug D — Maiuscolo (NON è un bug)
"METTI UN INTERVENTO" è in maiuscolo. `VERBO_CREA_RE` è case-insensitive (`/i`), quindi matcha correttamente. Il turno 1 ha funzionato. Non è una causa.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 1112-1131 | branch missing → ritorno senza save pending |
| `projects/iris/functions/handlers/ares.js` | `isCreaInterventoCommand` | regex verbo creazione, non matcha follow-up senza verbo |
| `projects/iris/functions/handlers/ares.js` | `tryInterceptAresConfermaIntervento` | intercept conferma `sì/ok` su pending. Non gestisce "completamento campi" |
| `projects/iris/functions/index.js` | nexusRouter pre-Haiku | intercept ares creazione regex-based |
| `projects/iris/functions/handlers/forge.js` | nexusTestInternal | stesso intercept |
| `projects/iris/functions/handlers/preventivo.js` | `tryInterceptPreventivoVoci`, `tryInterceptPreventivoIva`, etc. | pattern di riferimento per pending multi-turno (preventivo) |
| **Cloud Functions logs** | callHaikuForIntent | errore Anthropic balance |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Salvare pending parziale anche con campi mancanti (S, critica)
**Dove:** `ares.js:1112-1122`.
**Cosa fa:** anche quando `missing.length > 0`, salvare il pending con i campi disponibili e marcarlo come `stato: "incompleto"` con `missingFields: [...]`.

```js
if (missing.length) {
  const pendingPartial = {
    ...pending,
    stato: "incompleto",
    missingFields: missing,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (sessionId) {
    try {
      await db.collection("nexo_ares_pending").doc(sessionId).set(pendingPartial, { merge: true });
    } catch (e) {
      logger.warn("ares pending partial save failed", { error: String(e).slice(0, 120) });
    }
  }
  return {
    content: `Per aprire un intervento mi serve ancora: ${missing.join(", ")}. Dimmi i dettagli mancanti e completo.`,
    data: { pendingApproval: { kind: "ares_crea_intervento_incompleto", sessionId }, pending: pendingPartial, missing },
  };
}
```

**Perché:** preserva lo stato per il turno successivo. Pattern già usato per i preventivi (`nexo_preventivi_pending` con stato `attesa_voci`).

### 2) Nuovo intercept "completamento pending ARES" (M, critica)
**Dove:** `ares.js`, nuovo `tryInterceptAresCompletamento` esportato.
**Cosa fa:** se per la sessione esiste un pending `kind=ares_crea_intervento` con `stato=incompleto`, intercetta i messaggi successivi che contengono **almeno uno** dei campi mancanti e rieseguono `handleAresCreaIntervento` con i parametri arricchiti.

```js
export async function tryInterceptAresCompletamento({ userMessage, sessionId, userId }) {
  if (!sessionId) return null;
  // Cerca pending incompleto
  let pending;
  try {
    const doc = await db.collection("nexo_ares_pending").doc(sessionId).get();
    if (!doc.exists) return null;
    pending = doc.data();
    if (pending.kind !== "ares_crea_intervento") return null;
    if (pending.stato !== "incompleto" || !Array.isArray(pending.missingFields) || !pending.missingFields.length) return null;
  } catch { return null; }

  // Estrai campi MANCANTI dal nuovo userMessage
  const newParams = { ...pending };
  const newCondominio = await _extractCondominio(userMessage, {}, sessionId);
  const newDescrizione = _extractDescrizione(userMessage, {});
  const newDue = _parseDataOra(userMessage, {});
  const newTecnici = _extractTecniciCrea(userMessage, {});

  let updated = false;
  if (pending.missingFields.includes("condominio o indirizzo") && newCondominio.value) {
    newParams.condominio = newCondominio.value;
    updated = true;
  }
  if (pending.missingFields.includes("descrizione") && newDescrizione) {
    newParams.descrizione = newDescrizione;
    updated = true;
  }
  if (pending.missingFields.includes("data") && newDue) {
    newParams.due = newDue.toISOString();
    updated = true;
  }
  if (pending.missingFields.includes("tecnico") && newTecnici.length) {
    newParams.tecnici = newTecnici;
    updated = true;
  }

  // Per i campi non-missing ma comunque arricchibili (es. descrizione)
  if (!pending.descrizione && newDescrizione) {
    newParams.descrizione = newDescrizione;
    updated = true;
  }

  if (!updated) return null; // niente di nuovo, lascia passare

  // Riesegui handleAresCreaIntervento simulando il merge
  const fakeCtx = { userMessage: _reconstructUserMessage(newParams), sessionId };
  return await handleAresCreaIntervento({
    tecnici: newParams.tecnici,
    data: newParams.due,
    condominio: newParams.condominio,
    descrizione: newParams.descrizione,
    sessionId,
  }, fakeCtx);
}
```

**Wiring**: in `nexusRouter` (`index.js`) e `nexusTestInternal` (`forge.js`), chiamare questo intercept **prima** di `tryInterceptAresConfermaIntervento` (perché un follow-up di completamento NON è una conferma).

**Perché:** elimina la dipendenza da Haiku per follow-up. Il sistema gestisce nativamente il completamento step-by-step come fa già per i preventivi.

### 3) Aggiungere "descrizione" come campo mancante esplicito (S)
**Dove:** `ares.js:1112-1116`.
**Cosa fa:** oggi `missing` controlla solo tecnici/data/condominio. Se Alberto non specifica descrizione, l'handler procede con default "manutenzione". Meglio chiedere esplicitamente:

```js
if (!descrizione || descrizione.length < 5) missing.push("descrizione (cosa fare)");
```

Esempio: "metti intervento a Victor domani al Kristal" → "Mi serve la descrizione: cosa deve fare?"

**Perché:** evita di creare card senza descrizione utile. Anche Haiku non aiuta in questo (default "manutenzione").

### 4) Multi-turno ricco: chiamata di follow-up esplicita (S)
**Dove:** `ares.js:handleAresCreaIntervento`, formato del prompt missing.
**Cosa fa:** quando si chiede campi mancanti, formattare la richiesta in modo da invitare risposta naturale. Esempi:

> Turno 1 missing: "Per aprire un intervento mi servono: condominio o indirizzo. Dimmi quale e completo."
>
> Turno 2 utente: "residenza le rose"
> Turno 2 NEXUS (intercept completamento): "OK, RESIDENZA LE ROSE. Cosa deve fare Victor domani alle 9?"
>
> Turno 3 utente: "controllo impianto solare"
> Turno 3 NEXUS (preview con tutti i campi pronti): "Creo un intervento per VICTOR, martedì 28/04/2026 alle 09:00, presso S029 - RESIDENZA LE ROSE...: controllo impianto solare. Confermi?"

### 5) Fallback robusto se Anthropic non risponde (M, follow-up)
**Dove:** `index.js` + `forge.js` nel branch `callHaikuForIntent` failure.
**Cosa fa:** se Haiku ritorna `errore_modello` E c'è un pending ARES `incompleto`, prova **prima** l'intercept di completamento (step 2) prima di restituire l'errore. Aggiunge resilienza al sistema senza dipendere dall'API esterna.

```js
catch (e) {
  // Tenta gli intercept regex prima di ritornare errore
  const aresCompl = await tryInterceptAresCompletamento({ userMessage, sessionId });
  if (aresCompl) {
    // ... return aresCompl ...
  }
  // ... fallback errore originale ...
}
```

### 6) Logging diagnostico per pending state (S)
**Dove:** `ares.js:handleAresCreaIntervento`.
**Cosa fa:** log strutturato pre/post creazione pending:
```js
logger.info("[ARES] crea_intervento", {
  sessionId,
  hasExistingPending: !!existingPending,
  parsedTecnici: tecnici, parsedDue: due?.toISOString(), parsedCond: cond.value, parsedDescr: descrizione,
  missing,
});
```

Aiuta a tracciare flow multi-turno in produzione.

### 7) Anthropic balance — task separato (S, infra)
**Dove:** Anthropic console + segreto in Firebase Functions.
**Cosa fa:** ricaricare balance + impostare alerting su balance basso. Out of scope ARES ma necessario.

## Rischi e alternative

### R1 — Pending incompleto con TTL
Se Alberto inizia un'intervento e poi lo dimentica, il pending resta a tempo indeterminato. Mitigazione: TTL 30 minuti via cleanup job o check `updatedAt > now - 30min` nell'intercept di completamento. Pattern già documentato per `nexo_preventivi_pending`.

### R2 — Falso positivo nel completamento
"residenza le rose per controllo impianto solare" è un completamento facile. Ma "ciao" o "ok" non lo sono — devono cadere su Haiku/intercept conferma. Mitigazione: il check `if (!updated) return null` già garantisce di NON intercettare se nessun campo nuovo è estraibile.

### R3 — Doppia richiesta per stesso campo
Se Alberto risponde "boh" al turno 2 → updated=false → cade su Haiku/conferma. Conferma intercept guarda `^\s*(sì|ok|...)` quindi "boh" non matcha. → torna al routing standard → fallback alla risposta del turno 1 ripetuta? Mitigazione: gestire gracefully — se pending incompleto E nessun field arricchibile E nessun verbo conferma/annulla → ripetere la richiesta dei campi mancanti senza ricreare il pending.

### R4 — Pattern multi-turno non gestito su Haiku errore
Se Haiku è giù E pending non esiste → impossibilità di rispondere. Mitigazione: step 5 (intercept completamento prima dell'errore Haiku).

### R5 — Lookup canonico boardName lento
Step 2 fa `_lookupBoardCanonical` (limit 5000 read Firestore). Su completamento a ogni turno il costo si moltiplica. Mitigazione: cache in `nexo_ares_pending.canonicalBoardName` dopo primo lookup.

### Alternative scartate

- **A1: forzare Alberto a scrivere tutto in un messaggio**: degrada UX. Il flow naturale è multi-turno.
- **A2: fare TUTTO con Haiku state machine**: dipendenza pesante + costo + fallibile. Bocciato.
- **A3: nuova collection `nexo_ares_history` con tutti i turni**: overkill. Pending semplice basta.

## Effort stimato

**Totale: M (medium)** — 90-120 minuti netti.

| Step | Effort |
|---|---|
| 1) salva pending parziale con stato=incompleto + missingFields | S — 20' |
| 2) nuovo intercept tryInterceptAresCompletamento | M — 60' |
| 3) check descrizione mancante | S — 10' |
| 4) prompt più informativo | S — 10' |
| 5) fallback su Haiku failure → intercept completamento | S — 20' |
| 6) logging diagnostico pending | S — 10' |
| Wiring intercept in index.js + forge.js | S — 20' |
| Test FORGE: 3 turni split → preview corretto | S — 30' |
| Deploy + email + commit | S — 10' |
| Anthropic balance reload (separato) | S — 5' |

## Test di accettazione

1. **Caso reale Alberto:**
   - T1 "metti intervento a Victor domani mattina" → "Mi serve condominio. Dimmi dove."
   - T2 "residenza le rose per controllo impianto solare" → preview completo con tutti i campi (Victor, 28/04 09:00, S029 RESIDENZA LE ROSE, controllo impianto solare). "Confermi?"
   - T3 "sì" → scrittura reale.

2. **Caso step 3 (descrizione mancante):**
   - T1 "metti intervento a Victor domani al Kristal" → "Mi serve la descrizione: cosa deve fare?"
   - T2 "controllo caldaia" → preview completo.

3. **Robusto a Haiku errore:**
   - Anthropic 400 → intercept completamento ARES prova comunque a estrarre campi → preview se arricchito.

4. **Annullamento pending parziale:**
   - "annulla" su pending incompleto → cancella pending senza preview.

## Nota operativa

Il flow multi-turno è già implementato per i preventivi (state machine `attesa_voci` → `attesa_approvazione` → `approvato`). Per ARES creazione bisogna replicare lo stesso pattern (`incompleto` → `pronto` → `confermato`). I 7 step sopra portano ARES allo stesso livello di maturità di Calliope/preventivo.

L'errore Anthropic balance è un sintomo: il sistema dovrebbe **funzionare al 90%** anche senza Haiku, perché i comandi diretti hanno DIRECT_HANDLERS regex-based. Il fix step 1+2 garantisce che la creazione intervento (caso più frequente) sia totalmente Haiku-free dopo il primo turno.
