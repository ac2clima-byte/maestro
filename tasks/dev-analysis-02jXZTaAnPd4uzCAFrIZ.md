# Analisi dev-request `02jXZTaAnPd4uzCAFrIZ`

**Data:** 2026-04-28 14:33Z
**Tipo:** bug_from_chat — perdita contesto conversazionale + label "Tutti"
**Sessione:** `nx_m14umwxtmoiq70o7`
**Nota Alberto:** "perde il contesto"

## Sintesi

Sessione 3 turni:

| # | Alberto | NEXUS | Esito |
|---|---|---|---|
| 1 | "ciao" | "Eccomi, cosa ti serve?" | ✅ regex L1 |
| 2 | "che appuntamenti ha domani david?" | "Aime david non ha interventi pianificati per mercoledì 29 aprile." | ✅ corretto (David non ha nulla domani) |
| 3 | "e oggi?" | "**Tutti** non ha interventi pianificati per martedì 28 aprile." | ❌ contesto perso + label malformata |

**Due bug distinti**:

1. **Bug A — Contesto conversazionale perso**: "e oggi?" è un riferimento
   ellittico a David (turno precedente). NEXUS doveva interpretarlo come
   "che appuntamenti ha **David** oggi?" e invece ha cercato gli interventi
   di "tutti" i tecnici.

2. **Bug B — Label "Tutti" malformata**: anche se l'intent fosse stato
   corretto ("tutti i tecnici, oggi"), la frase "Tutti **non ha** interventi"
   è grammaticalmente sbagliata (concordanza singolare/plurale). E il
   handler crea il filtro `tecnicoFilter="tutti"` che produce 0 risultati
   perché nessun tecnico si chiama letteralmente "TUTTI".

---

## Bug A — Perdita contesto: il router Groq L2 non riceve la cronologia

### Path osservato

1. Turno 3 "e oggi?" — non matcha nessun regex L1 (mancano marker
   tecnico, città, intervento)
2. Cade su Groq L2 via `callIntentRouter`
3. **`callIntentRouter` passa a `callGroqIntent` SOLO l'ultimo turno utente**:
   ```js
   // nexus.js:1469
   const lastUser = [...messages].reverse().find(m => m.role === "user");
   const userText = lastUser ? String(lastUser.content || "") : "";
   // ...
   const r = await callGroqIntent({
     apiKey: groqKey,
     system: systemCompact,
     user: userText,           // ← SOLO "e oggi?"
     ...
   });
   ```
4. Groq vede solo `"e oggi?"` senza sapere che il turno prima si parlava
   di David. Senza contesto, sceglie un default: probabilmente
   `{collega:"ares", azione:"interventi_aperti", parametri:{data:"oggi", tecnico:"tutti"}}`
   come fallback ragionevole quando manca un tecnico esplicito.

5. `tryDirectAnswer(intent)` post-LLM matcha ARES interventi_aperti →
   `handleAresInterventiAperti(parametri={data:"oggi", tecnico:"tutti"})` →
   `tecnicoFilter = "tutti"` → ricerca su `bacheca_cards` con
   `where("techName","==","TUTTI")` → 0 risultati → render "Tutti non ha
   interventi pianificati per martedì 28 aprile".

### File coinvolti

- `projects/iris/functions/handlers/nexus.js:1467-1503` — `callIntentRouter`,
  riga 1469-1470 estrae `lastUser` perdendo cronologia
- `projects/iris/functions/handlers/shared.js:callGroqIntent` — accetta
  solo `system` + `user` come stringhe singole, costruisce 2-messaggi
  `[{role:"system",content:system}, {role:"user",content:user}]`. Non può
  ricevere cronologia.
- `projects/iris/functions/index.js:561-563` — `loadConversationContext`
  carica gli ultimi 5 turni in `sessionContext`, lo merge con `history`
  client e passa l'array `messages` a `callIntentRouter`. Quindi il
  contesto **arriva** al router, ma il router lo butta via.

### Storia del codice

Quando il router era Haiku, `callHaikuForIntent(apiKey, messages)`
passava l'intero array `messages` ad Anthropic API che supporta cronologia
multi-turno. Quando ho rimosso Haiku e introdotto Ollama (`callOllamaIntent`)
e poi Groq (`callGroqIntent`), entrambe queste signature accettano un
solo `user`. Il bug è stato introdotto inavvertitamente al refactor
Strategia B (`c343ca1`, 28 aprile mattina): per Ollama 1.5b il contesto
lungo peggiorava la qualità (modello piccolo che si confonde), quindi
ho deliberatamente passato solo l'ultimo turno. Quando ho aggiunto Groq
ho mantenuto la stessa signature per uniformità — ma per Groq llama-3.3-70b
**non c'era motivo** di buttare il contesto, e ora ne paghiamo il costo.

### Proposta Fix A — Passare cronologia a Groq

**Step 1**: estendere `callGroqIntent` ad accettare un parametro
opzionale `history: Array<{role,content}>` che, se presente, viene
inserito tra il system e l'ultimo user nel body:

```js
// shared.js (modifica)
export async function callGroqIntent({
  apiKey, system, user, history = [],
  model = GROQ_MODEL, maxTokens = 400, timeoutMs = 15000, responseFormatJson = true
}) {
  if (!apiKey) throw new Error("no_groq_key");
  const messages = [{ role: "system", content: system }];
  // Cronologia (max ultimi 5 turni). Salta se history fornita ma vuota.
  for (const h of history.slice(-5)) {
    if (!h?.role || !h?.content) continue;
    messages.push({ role: h.role, content: String(h.content).slice(0, 1000) });
  }
  messages.push({ role: "user", content: user });
  // ... resto invariato
  const body = { model, messages, temperature: 0, max_tokens: maxTokens };
  // ...
}
```

**Step 2**: `callIntentRouter` deve passare il contesto a Groq:

```js
// nexus.js:1467+ (modifica)
export async function callIntentRouter(apiKey, messages) {
  // Estrai ultimo turno utente come "user" finale
  const lastUserIdx = [...messages].reverse().findIndex(m => m.role === "user");
  const lastUser = lastUserIdx >= 0 ? messages[messages.length - 1 - lastUserIdx] : null;
  const userText = lastUser ? String(lastUser.content || "") : "";
  // Cronologia precedente (escludi l'ultimo user che va in `user` field)
  const history = messages.slice(0, messages.length - 1 - lastUserIdx);

  // ... systemCompact invariato
  // L2 Groq:
  const r = await callGroqIntent({
    apiKey: groqKey,
    system: systemCompact,
    user: userText,
    history,                            // ← NUOVO
    model: GROQ_MODEL,
    // ...
  });
}
```

Effetto: Groq vedrà l'intera conversazione e capirà che "e oggi?" si
riferisce a David. Costo: 50-100 token in più per turno (prompt cache
Groq dovrebbe gestirlo bene), latenza +50-100ms tipica.

### Effort: **S** (20-30 min)

Modifica chirurgica a 2 funzioni + test FORGE multi-turno.

---

## Bug B — Label "Tutti" + grammatica sbagliata

### Causa diretta

Quando il LLM (Groq o Ollama) mette `parametri.tecnico = "tutti"` come
fallback, `handleAresInterventiAperti` accetta la stringa letterale come
filtro e la usa per:
1. Query Firestore `where("techName","==","TUTTI")` → 0 doc
2. Render "Tutti non ha interventi" (capitalizzazione di "tutti")

### File coinvolti

- `projects/iris/functions/handlers/ares.js:232-233`:
  ```js
  let tecnicoFilter = String(parametri.tecnico || parametri.nome || "").trim().toLowerCase() || null;
  if (!tecnicoFilter) tecnicoFilter = _extractTecnico(userMessage);
  ```
  Nessun check su valori-sentinella tipo "tutti", "ognuno", "tecnici",
  "loro" — vengono trattati come nomi reali.

- `projects/iris/functions/handlers/ares.js:485-486`:
  ```js
  const tecnicoCap = tecnicoFilter
    ? tecnicoFilter.charAt(0).toUpperCase() + tecnicoFilter.slice(1)
    : null;
  ```
  Capitalizza la stringa cieca → "tutti" → "Tutti".

### Proposta Fix B — Sanitizzare valori-sentinella

```js
// ares.js:232-233 (modifica)
const TECNICI_SENTINELLE = new Set([
  "tutti", "tutte", "ognuno", "tecnici", "loro", "qualcuno", "chiunque",
  "noi", "voi", "ciascuno", "qualsiasi"
]);
let tecnicoFilter = String(parametri.tecnico || parametri.nome || "").trim().toLowerCase() || null;
if (tecnicoFilter && TECNICI_SENTINELLE.has(tecnicoFilter)) tecnicoFilter = null;
if (!tecnicoFilter) tecnicoFilter = _extractTecnico(userMessage);
```

Effetto: quando il LLM mette `tecnico:"tutti"`, viene riconosciuto come
"nessun filtro tecnico" → query su tutta la lista interventi (branch
`byListName`). La risposta sarà "Nessun intervento martedì 28 aprile" —
grammaticalmente corretta e semanticamente onesta (non c'è davvero
nessun intervento globale per oggi).

### Effort: **S** (10 min)

3 righe di codice + test FORGE con prompt "tutti".

---

## Bug A è la causa principale, Bug B è il sintomo cosmetico

Una volta risolto Bug A (Groq vede contesto):
- "e oggi?" diventa "che appuntamenti ha David oggi?" implicito
- Groq routerà `{collega:"ares", parametri:{tecnico:"David", data:"oggi"}}`
- Risposta corretta: "David oggi non ha interventi pianificati"

Bug B fixa il caso edge "anche se Groq mette `tecnico:'tutti'`, non
rovina la risposta". Va comunque fatto come hardening difensivo — anche
con contesto, il modello potrebbe ancora produrre `tecnico:"tutti"` su
prompt esplicitamente generici tipo "che ha tutto il team domani?".

---

## Test plan

```bash
TS=$(date +%s)
SID="forge-test-context-${TS}"

# Turno 1: ciao
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"ciao\"}"

# Turno 2: tecnico esplicito
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"che appuntamenti ha domani david?\"}"

# Turno 3: ellissi — DEVE ereditare David
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"e oggi?\"}"

# Atteso post-fix: "David oggi non ha interventi pianificati."
# (NON "Tutti non ha interventi pianificati")
```

Altri pattern da testare per assicurarsi che il contesto funzioni:

- Turno 1 "interventi di Marco oggi" → ARES; Turno 2 "e domani?" → deve
  essere Marco domani
- Turno 1 "che dossier ha Rossi?" → MEMO; Turno 2 "e i suoi pagamenti?"
  → deve essere CHARTA su Rossi (cross-collega con contesto)

---

## File da modificare (riepilogo)

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/shared.js` | `callGroqIntent` | aggiungi parametro `history` opzionale, inserisci nel body Groq |
| `projects/iris/functions/handlers/nexus.js` | `callIntentRouter` 1469-1503 | passa cronologia (slice di `messages` escluso ultimo user) a `callGroqIntent` come `history` |
| `projects/iris/functions/handlers/ares.js` | 232-233 | TECNICI_SENTINELLE blocklist per "tutti/tutte/ognuno/tecnici/loro" |

## Effort totale

- Bug A (contesto): **S** (20-30 min)
- Bug B (sentinelle): **S** (10 min)
- Deploy + test FORGE multi-turno: **S** (15 min)
- **Totale**: ~45-60 min, single commit

## Stato collaterale

- Groq L2 attivo da ~1h, sta gestendo i prompt fuzzy. Il bug è emerso
  proprio perché Groq risponde rapidamente abbastanza da far notare la
  perdita di contesto — con Ollama 1.5b "tutti" non si vedeva perché
  la risposta era talmente lenta/sbagliata che il problema sembrava
  altro (allucinazione globale).
- Fix priorità ALTA: Alberto e Sara hanno usato pattern con riferimenti
  ellittici ("e domani?", "e oggi?") in più sessioni — è uso normale di
  chat. Senza contesto NEXUS resta poco utilizzabile per follow-up.

## Possibile ottimizzazione futura

Limitare la cronologia inviata a Groq agli **ultimi 3-4 turni** per
contenere i token. Per il routing intent, contesto più lungo non
aiuta (anzi confonde su sessioni lunghe con argomenti diversi). 5 turni
default è già un compromesso ragionevole, ma 3 funziona altrettanto bene
e costa la metà.
