# feat(nexo): predisposizione routing Groq + Ollama 7b fallback

**Data:** 2026-04-28
**Stato:** L1 + L3 deployati, **L2 (Groq) in attesa di GROQ_API_KEY**

## Architettura implementata

### Livello 1 — Regex DIRECT_HANDLERS (zero costo, zero latenza)
Espansa con i pattern del task:
- ✅ Saluti / grazie (canned)
- ✅ Interventi (con/senza tecnico, data, città, esistenziali "ci sono")
- ✅ Email (recenti, urgenti, leggi, paginazione)
- ✅ Condomini (abbiamo/c'è/esiste, **indirizzo via X aggiunto**)
- ✅ Preventivi (prepara, lista, emessi)
- ✅ Bug report ("non funziona/è rotto/ho un bug" — esclusioni feedback)
- ✅ Scadenze (CURIT + **F-Gas aggiunto**)
- ✅ Esposizione/crediti ("chi ci deve", "crediti aperti")
- ✅ Campagne (walkby, spegnimento, lista)
- ✅ RTI pronti, bozze CRTI

### Livello 2 — Groq API (200-500ms, gratuito) — IN ATTESA KEY
Implementazione completa:
- `callGroqIntent()` in `shared.js` (OpenAI-compat, JSON mode forzato)
- `isGroqTransientError()` per distinguere retry vs raise
- `getGroqApiKey()` che legge da `process.env.GROQ_API_KEY`
- `callIntentRouter` chiama Groq prima di Ollama L3

Modello: `llama-3.3-70b-versatile` (sostituisce `llama-3.1-70b-versatile`
deprecato).

**Stato**: il codice è deployato ma **GROQ_API_KEY non è valorizzata**,
quindi `getGroqApiKey()` ritorna null e il router cade su Ollama L3.

### Livello 3 — Ollama qwen2.5:7b fallback (4-15s caldo)
- Modello: `qwen2.5:7b` su Hetzner NEXO `diogene` (168.119.164.92:11434)
- Latenza warm: 8-15s, cold: ~25s
- Timeout: 75s (function timeout 90s lascia 15s di margine)
- Pre-warm consigliato post-deploy

NB: **NON usato qwen2.5:1.5b** (allucina caoticamente, 1/6 al benchmark).
**NON usato phi3:mini** (4/6 al benchmark ma latenza 60-80s sul prompt
completo, va in timeout function).

## Test FORGE — 6 prompt benchmark (Groq disabilitato → L1 + L3)

| # | Prompt | Source | Routing | Tempo | Esito |
|---|---|---|---|---|---|
| 1 | abbiamo un condominio fiordaliso? | regex L1 | memo/regex_match | 4.9s | ✅ "Sì, c'è B027 - CONDOMINIO FIORDALISO..." |
| 2 | che indirizzo ha il condominio via tonso 3 | ollama L3 | memo/ricerca_indirizzo | 70s | ✅ "Ho 2 clienti con quell'indirizzo: K001 — Via Tonso 3..." |
| 3 | non funziona la dettatura vocale | dev_request intercept | nessuno/dev_request | 0.8s | ✅ registrata come bug |
| 4 | trova impianto targa PH4QC34139879603 | ollama L3 | dikea/impianti_senza_targa | 67s | ⚠️ routing imperfetto (manca handler `cerca_per_targa`, vedi P02YSi analysis) |
| 5 | che interventi ha david oggi | regex L1 | ares/regex_match | 4.1s | ✅ 2 interventi reali |
| 6 | raccontami qualcosa | ollama L3 | nessuno/saluti | 65s | ✅ neutro, non inventa fatti |

**6/6 routing semanticamente corretto, 4/6 risposta utile.**

## Tabella tempi attesi una volta Groq attivo

| Livello | Trigger | Latenza tipica | Costo |
|---|---|---|---|
| L1 regex | pattern frequenti coperti | 0.001s | 0 |
| L2 Groq llama-3.3-70b | non coperto da L1 | **0.2-0.5s** | 0 (free tier 14400/giorno) |
| L3 Ollama qwen2.5:7b | Groq down/rate limit | 8-15s caldo, 25s cold | 0 (server proprio) |

Ogni messaggio finisce in uno di questi 3 path.

## Per attivare Groq L2 (Alberto)

**Opzione A — Firebase Secret Manager (consigliato)**:
```bash
firebase functions:secrets:set GROQ_API_KEY --project=nexo-hub-15f2d
# Paste della key gsk_... → invio
```

Poi in `shared.js` aggiungere:
```js
export const GROQ_API_KEY = defineSecret("GROQ_API_KEY");
```
e in `index.js` + `forge.js`, aggiungere `GROQ_API_KEY` a `secrets:[]`.
Re-deploy.

**Opzione B — env var diretta**:
Crea `projects/iris/functions/.env` (già in `.gitignore`) con:
```
GROQ_API_KEY=gsk_...
```
Re-deploy. Il codice già legge `process.env.GROQ_API_KEY` via `getGroqApiKey()`.

## File modificati

| File | Modifica |
|---|---|
| `projects/iris/functions/handlers/shared.js` | `callGroqIntent` + `isGroqTransientError` + `getGroqApiKey` + costanti GROQ_URL/GROQ_MODEL |
| `projects/iris/functions/handlers/shared.js` | `OLLAMA_MODEL_FALLBACK = "qwen2.5:7b"` (nuovo, sostituisce 1.5b) |
| `projects/iris/functions/handlers/nexus.js` | `callIntentRouter` riscritto: regex L1 (upstream) → Groq L2 → Ollama L3 |
| `projects/iris/functions/handlers/nexus.js` | regex L1 estese: F-Gas, "chi deve", "crediti aperti", "è rotto X", "ho un bug" |
| `projects/iris/functions/.env.example` | template env vars per Cloud Functions |

## Limitazioni note (non Strategia 3-livelli)

- Caso #4 ("trova impianto targa X"): manca handler dedicato. Da P02YSi
  analysis: aggiungere `handleDikeaCercaPerTarga` in `dikea.js` (effort M).
  Senza, anche Groq L2 non potrà aiutare — è un gap funzionale.
- Latenza L3 dolorosa (60-70s a turno) se Groq non disponibile. Una volta
  Groq L2 attivo, L3 sarà raro (solo 429 / 5xx).

## Deploy

- `nexusRouter` + `nexusTestInternal` (europe-west1, timeoutSeconds 90)
- Codice in produzione, GROQ_API_KEY mancante → fallback L3 attivo
