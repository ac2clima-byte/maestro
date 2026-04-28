# Analisi dev-request `XwOOJMSUlMvA0sC4bGfJ`

**Data:** 2026-04-28
**Tipo:** bug_from_chat — query trasformata in comando creazione
**Sessione:** `nx_ho1vzqdsmoighuqj`

## Sintesi

> ALBERTO: "abbiamo un condominio fiordaliso?"  ← QUERY semplice
>
> NEXUS: "Creo un intervento per AIME, DAVID, ALBANESI, GIANLUCA, CONTARDI,
> ALBERTO, DELLAFIORE, LORENZO, VICTOR, LESHI, ERGEST, PIPARO, MARCO, TOSCA,
> FEDERICO, TROISE e ANTONIO, martedì 28/04/2026 alle 09:00, presso B027 -
> CONDOMINIO FIORDALISO - VIA DEL MERLO, 3 - VOGHERA (PV): manutenzione.
> Confermi?"

NEXUS ha trasformato una **domanda esistenziale** ("abbiamo un X?") in un
**comando di creazione intervento** con tutti i 9 tecnici, oggi alle 09:00,
descrizione di default "manutenzione". Risposta totalmente fuori contesto.

L'unica cosa giusta che NEXUS ha fatto è il lookup canonico del condominio:
sì, "B027 - CONDOMINIO FIORDALISO" esiste in `bacheca_cards`. Ma la
domanda dell'utente era proprio quella — risposta corretta sarebbe:

> "Sì, c'è B027 - CONDOMINIO FIORDALISO in via del Merlo 3 a Voghera."

---

## Diagnosi (3 bug concatenati)

### Bug 1 — Ollama 1.5b allucina `crea_intervento` come default fallback

**Path osservato**:

1. Messaggio "abbiamo un condominio fiordaliso?" non matcha **nessun**
   regex L1 (vedi sotto)
2. `callIntentRouter` chiama Haiku → 400 (balance esaurito) → fallback
   Ollama qwen2.5:1.5b
3. Ollama ritorna probabilmente
   `{collega:"ares",azione:"crea_intervento",parametri:{condominio:"fiordaliso", tecnici:[<all>]}}`
4. `tryDirectAnswer` post-LLM trova match
   (`col==="ares" && /crea_intervent/.test(az)` riga `nexus.js:497-501`)
5. `handleAresCreaIntervento` esegue → estrae condominio + lookup canonico
   → trova B027 → genera riepilogo "Creo un intervento per..."

Pattern già visto nei test FORGE (`forge-test-ollama-fb-A5`,
`forge-test-bug2-V2`): **qwen2.5:1.5b sceglie `crea_intervento` come
default per qualunque prompt fuzzy che menzioni "condominio"** (è nello
schema few-shot del system prompt come esempio principale).

### Bug 2 — Regex L1 non copre query esistenziali "abbiamo un X?"

In `nexus.js:DIRECT_HANDLERS`:

- ARES `interventi_aperti` (riga 509-524): copre "interventi … oggi/domani"
  e "che/quali interventi" ma **non** "abbiamo un condominio X?"
- MEMO `dossier` (riga 440-444): copre "dimmi tutto su X" / "dossier X"
  ma **non** "abbiamo un X?"
- MEMO `chi_e` (riga 433-438): solo per persone ("chi è Mario Rossi"),
  non per condomini

Manca un handler per la classe di domande:
- "abbiamo un condominio X?"
- "esiste/c'è il condominio X?"
- "ho il cliente X?"
- "il condominio X è in anagrafica?"

Sono lookup nel CRM (`crm_clienti`/`bacheca_cards` boardName) per
verificare l'esistenza di un'anagrafica.

### Bug 3 — `handleAresCreaIntervento` non si difende da contesto sbagliato

`ares.js:1082+` `handleAresCreaIntervento` accetta qualsiasi messaggio
e prova a estrarre tecnici/data/condominio. Anche se il messaggio è una
QUERY ("abbiamo X?"), il handler:

- Non verifica che il messaggio sia effettivamente un comando di
  creazione (`isCreaInterventoCommand` non viene rivalutato)
- Estrae `parametri.condominio = "fiordaliso"` da Ollama → lookup canonico
- Estrae `parametri.tecnici = [tutti i 9]` da Ollama allucinazione
- Default ora 09:00, default descrizione "manutenzione"
- Compone il riepilogo ottimisticamente, chiede conferma

L'unico guardrail è il check `isCreaInterventoCommand` nel **DIRECT_HANDLERS
match** (`nexus.js:500`), ma viene saltato perché il primo ramo del match
è `col==="ares" && /crea_intervent/.test(az)` che scatta SEMPRE quando
Ollama ha allucinato (true || true short-circuit non rilevante: il primo
ramo accetta anche senza isCreaInterventoCommand).

### Bug 4 (sotto-causa di Bug 1) — Ollama che allucina TUTTI i tecnici

In `_extractTecniciCrea` riga 835:

```js
if (Array.isArray(parametri.tecnici)) for (const t of parametri.tecnici) add(t);
```

Se Ollama 1.5b mette `parametri.tecnici = ["AIME","DAVID","ALBANESI",...]`
(forse perché nel system prompt vede l'elenco dei 9 tecnici ACG e li
copia tutti), il handler li accetta senza validazione.

In più, c'è una sotto-trappola al punto 4 di `_extractTecniciCrea`
(riga 848-851):

```js
for (const nome of TECNICI_ACG) {
  if (new RegExp(`\\b${nome}\\b`, "i").test(m)) out.add(nome.toUpperCase());
}
```

Per "abbiamo un condominio fiordaliso?" nessun nome tecnico è nel testo,
quindi questo loop non aggiunge niente. La causa è Ollama che mette tutti
i tecnici in `parametri.tecnici`.

---

## File coinvolti

| File | Riga | Ruolo nel bug |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 497-501 | DIRECT_HANDLER ares/crea_intervento accetta `col===ares && az contains "crea_intervent"` senza richiedere isCreaInterventoCommand |
| `projects/iris/functions/handlers/nexus.js` | 1428-1496 | `buildOllamaSystemPrompt` con esempi che bias-ano il modello verso ares/crea_intervento |
| `projects/iris/functions/handlers/ares.js` | 824-853 | `_extractTecniciCrea` accetta `parametri.tecnici` da LLM senza sanity check (lunghezza, plausibilità) |
| `projects/iris/functions/handlers/ares.js` | 1082+ | `handleAresCreaIntervento` non rivalida che il userMessage sia effettivamente un comando |
| `projects/iris/functions/handlers/nexus.js` | 440-444 | `handleMemoDossier` regex L1 non copre "abbiamo un X?" |

---

## Proposta

### Fix 1 — Hardening DIRECT_HANDLER ares/crea_intervento (S, priorità ALTA)

Modifica match del primo ramo per richiedere SEMPRE
`isCreaInterventoCommand(userMessage)` come guardia esplicita, anche
quando il LLM ha messo `collega=ares`:

```js
// nexus.js:497-501 (modificato)
{ match: (col, az, ctx) => {
  const m = (ctx?.userMessage || "").toLowerCase();
  // NUOVO: il userMessage deve contenere un verbo di creazione, ALTRIMENTI
  // ignora il routing LLM (probabilmente allucinato).
  if (!isCreaInterventoCommand(m)) return false;
  if (col === "ares" && /(crea_intervent|metti_intervent|programma_intervent|fissa_intervent)/.test(az)) return true;
  return true; // isCreaInterventoCommand è già true qui
}, fn: handleAresCreaIntervento },
```

Effetto: "abbiamo un condominio fiordaliso?" → `isCreaInterventoCommand`
torna false → handler NON eseguito → cade su altri DIRECT_HANDLERS o
sul branch `in_attesa_collega` (problema separato della dev-request
`P02YSicd80jK5QrysPTf`).

### Fix 2 — Sanity check tecnici in `_extractTecniciCrea` (S, priorità ALTA)

`ares.js:824-853`: limita il numero di tecnici accettati da
`parametri.tecnici` quando il messaggio non li menziona esplicitamente:

```js
function _extractTecniciCrea(userMessage, parametri) {
  const out = new Set();
  const m = String(userMessage || "").toLowerCase();
  const add = (raw) => { /* invariato */ };

  // 1. Da parametri (Haiku/Ollama) — MA con sanity check:
  // se LLM mette ≥ 5 tecnici e nessuno è citato esplicitamente nel testo,
  // ignora (probabilmente allucinazione "tutti i tecnici").
  if (Array.isArray(parametri.tecnici)) {
    const fromLLM = parametri.tecnici.length;
    const explicitInMsg = TECNICI_ACG.filter(n => new RegExp(`\\b${n}\\b`, "i").test(m)).length;
    if (fromLLM >= 5 && explicitInMsg === 0) {
      logger.warn("ares: ignored LLM tecnici list (likely hallucination)",
        { count: fromLLM, msgPreview: m.slice(0, 80) });
    } else {
      for (const t of parametri.tecnici) add(t);
    }
  }
  // ... resto invariato
}
```

### Fix 3 — Nuovo handler "abbiamo/c'è il condominio X" (M, priorità MEDIA)

Estendere `handleMemoRicercaIndirizzo` o creare `handleMemoCercaCondominio`:

```js
// memo.js (nuovo handler)
export async function handleMemoCercaCondominio(parametri, ctx) {
  const userMessage = String(ctx.userMessage || "");
  // Estrai il nome del condominio dalla domanda
  const nomeQuery = parametri.condominio || parametri.nome || _parseNomeCondominio(userMessage);
  if (!nomeQuery) {
    return { content: "Quale condominio devo cercare?" };
  }
  // Cerca nel CRM (cosmina_clienti) E nelle bacheca_cards (boardName).
  // Render: "Sì, c'è B027 - CONDOMINIO FIORDALISO in via del Merlo 3 a Voghera."
  // Oppure: "Non trovo nessun condominio con 'fiordaliso'. Vuoi che lo cerchi diversamente?"
}
```

E DIRECT_HANDLER L1 in `nexus.js`:

```js
{ match: (col, az, ctx) => {
  const m = (ctx?.userMessage || "").toLowerCase();
  if (col === "memo" && /(cerca_condom|trova_condom|esiste_cond|abbiamo_cond)/.test(az)) return true;
  // "abbiamo/c'è/esiste un/il condominio X" / "ho il cliente X"
  if (/\b(?:abbiamo|c['']?\s*è|c['']?\s*sono|esiste|conosci|hai|ho)\s+(?:un|il|la|lo|gli|i|le)?\s*(?:condominio|cond\.|palazzin|residenz|stabile|cliente|client[ie])\b/i.test(m)) return true;
  // "il condominio X è in anagrafica?"
  if (/\b(?:condominio|cliente)\s+\S+.*\b(?:in\s+anagrafic|nel\s+crm|in\s+rubrica)\b/i.test(m)) return true;
  return false;
}, fn: handleMemoCercaCondominio },
```

**Vantaggio**: la query "abbiamo un condominio fiordaliso?" cade su regex
L1 PRIMA di Ollama. Zero costo, zero latenza, zero allucinazione.

### Fix 4 (opzionale) — Pulire `buildOllamaSystemPrompt` da bias creazione

In `nexus.js:1428-1496` ridurre la dominanza degli esempi `crea_intervento`
nel system prompt. Aggiungere esempi negativi:

```
- "abbiamo un condominio X?" → memo/cerca_condominio
- "c'è il cliente Y?" → memo/cerca_condominio
- "esiste l'impianto Z?" → memo/cerca_condominio
```

E rinforzare la regola: "Se il messaggio è una domanda esistenziale
(abbiamo/c'è/esiste/conosci) NON usare crea_intervento."

---

## Rischi e alternative

### Rischi Fix 1

- Se Haiku/Ollama mettono `collega=ares,azione=crea_intervento` su un
  messaggio che è davvero un comando ma usa un verbo non in
  `VERBO_CREA_RE` (es. "fammi un intervento" — c'è "intervento" ma
  manca match esatto), la fix 1 lo bloccherebbe.

- Mitigazione: estendere `VERBO_CREA_RE` con verbi di richiesta non
  imperativa ("fammi", "voglio", "ho bisogno di", "mi serve") accoppiati
  a "intervento". Ma con cautela perché "ho bisogno" è anche feedback.

### Rischi Fix 2

- Se Alberto detta "metti intervento per tutti i tecnici domani al
  Kristal", il LLM correttamente metterebbe ≥5 tecnici e il messaggio
  non li menzionerebbe esplicitamente → la fix scarterebbe a torto.

- Mitigazione: se il messaggio contiene parole tipo "tutti", "tutti i
  tecnici", "ognuno" allora accetta la lista LLM:

  ```js
  const meansAll = /\b(tutti|ognuno|tutto)\b/i.test(m);
  if (fromLLM >= 5 && explicitInMsg === 0 && !meansAll) { /* skip */ }
  ```

### Rischi Fix 3

- Falsi positivi su frasi tipo "abbiamo un cliente che..." (introduzione
  a un'altra domanda). Mitigazione: il regex richiede che dopo
  "abbiamo/c'è" ci sia un sostantivo specifico ("condominio/cliente/
  palazzina") + verifica che ci sia un nome dopo (lookup parametri).

### Alternativa A (più drastica)

Disattivare completamente `crea_intervento` quando la sorgente è Ollama
fallback (non Haiku). Ollama 1.5b non è abbastanza affidabile per
parsing parametri creazione. Solo Haiku può proporre creazione.

```js
// in tryDirectAnswer post-LLM
if (intent.azione?.includes("crea_intervent") && llmSource === "ollama") {
  // Richiede SEMPRE isCreaInterventoCommand esplicito
  if (!isCreaInterventoCommand(userMessage)) return null;
}
```

Vantaggio: protezione netta. Svantaggio: alcuni casi legittimi via Ollama
verrebbero persi.

### Alternativa B

Validazione post-LLM separata: dopo `parseAndValidateIntent`, se
`intent.azione === "crea_intervento"` MA `!isCreaInterventoCommand(userMessage)`
→ degrada a `intent.collega = "nessuno", azione = "chiarimento", risposta = "Non ho capito se vuoi creare un intervento o cercare un'anagrafica..."`.

---

## Effort stimato

| Fix | Effort | Priorità |
|---|---|---|
| 1 — Guard `isCreaInterventoCommand` in DIRECT_HANDLER | S (10 min + test) | ALTA |
| 2 — Sanity check tecnici allucinati | S (15 min) | ALTA |
| 3 — Nuovo handler `cerca_condominio` | M (45-60 min) | MEDIA |
| 4 — Few-shot Ollama prompt cleanup | S (15 min) | BASSA |

**Ordine consigliato**: Fix 1 → Fix 2 → Fix 3 (+ Fix 4 opzionale).

Fix 1+2 insieme (≤30 min) bloccano già il bug osservato. Fix 3 abilita
la risposta corretta proattiva (regex L1 → handler dedicato). Fix 4 è
ottimizzazione marginale.

---

## Test plan FORGE

```bash
# Bug osservato (deve diventare risposta utile, non creazione)
curl ... -d '{"sessionId":"forge-test-bug-XwOOJ-1","message":"abbiamo un condominio fiordaliso?"}'
# Atteso post-fix: memo/cerca_condominio → "Sì, B027 - CONDOMINIO FIORDALISO..."
# Oppure: stato chiarimento "Non ho un handler per questa query, registro come dev request"

# Regression: comandi creazione devono ancora funzionare
curl ... -d '{"sessionId":"forge-test-bug-XwOOJ-2","message":"metti intervento al Fiordaliso domani con Federico"}'
# Atteso: ARES crea_intervento normale

# Edge case "tutti i tecnici"
curl ... -d '{"sessionId":"forge-test-bug-XwOOJ-3","message":"metti intervento al Kristal domani con tutti i tecnici"}'
# Atteso: ARES crea_intervento con TUTTI i 9 (perché c'è "tutti i tecnici")

# Verifica regex L1 nuova
for q in "c'è il condominio merlo?" "esiste il cliente De Amicis?" "abbiamo il condominio Sole?"; do
  curl ... -d "{\"sessionId\":\"forge-test-bug-XwOOJ-4-$RANDOM\",\"message\":\"$q\"}"
done
# Atteso: tutti memo/cerca_condominio via regex L1, no LLM
```

---

## Stato collaterale

- Anthropic Haiku ancora -0.03 USD da 38h. Ogni messaggio fuzzy → Ollama
  1.5b → allucinazione `crea_intervento` come default. **Questo è il
  motivo principale per cui questa classe di bug si è manifestata adesso**.
- Quando Alberto ricarica, Haiku tornerà primario e la stessa query darà
  routing corretto (Haiku capisce "abbiamo un X" come domanda) — ma le
  fix proposte sono comunque corrette indipendentemente dal modello LLM.

---

## File da modificare (riepilogo)

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 497-501 | DIRECT_HANDLER ares/crea_intervento richiede sempre `isCreaInterventoCommand(m)` |
| `projects/iris/functions/handlers/ares.js` | 834-836 | `_extractTecniciCrea` ignora `parametri.tecnici` se ≥5 e nessuno citato nel messaggio (eccetto "tutti") |
| `projects/iris/functions/handlers/memo.js` | nuovo | `handleMemoCercaCondominio(parametri, ctx)` |
| `projects/iris/functions/handlers/nexus.js` | 440 (prima) | DIRECT_HANDLER L1 `memo/cerca_condominio` per "abbiamo/c'è/esiste un condominio X" |
| `projects/iris/functions/handlers/nexus.js` | 1486+ | (opz) few-shot Ollama "abbiamo un X?" → memo/cerca_condominio |
| `projects/iris/functions/index.js` | export | export `handleMemoCercaCondominio` |
