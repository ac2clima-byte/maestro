# feat(nexo): Ollama 7b fallback + espansione regex routing

**Data:** 2026-04-27
**Server LLM:** `diogene` (Hetzner NEXO, 168.119.164.92:11434)
**Functions deployate:** `nexusRouter`, `nexusTestInternal`

## Architettura a 3 livelli

### Livello 1 — Regex DIRECT_HANDLERS (zero costo, zero latenza LLM)
Spostato il match `tryDirectAnswer` **prima** della chiamata LLM. La maggior
parte dei pattern frequenti scatta qui: saluti, interventi tecnici, agende,
email, esposizione cliente, RTI, scadenze CURIT, campagne. Aggiunti due
DIRECT_HANDLERS specifici per saluti basici e ringraziamenti (canned reply).

### Livello 2 — Haiku con fallback Ollama
Se nessun regex matcha, `callIntentRouter` prova Anthropic Haiku per primo.
Se Haiku torna 400/401/403/429/5xx (incluso "balance too low") oppure
errore di rete, cade automaticamente su Ollama qwen2.5:**1.5b** locale.

Modello scelto: `qwen2.5:1.5b` (986 MB).
- 6× più veloce del 7b su CPU-only
- Qualità routing semplice paragonabile (vedi benchmark precedente)
- I pattern complessi (creazione intervento, preventivo) sono già intercettati
  a regex livello 1 e workflow dedicati, non passano dal fallback.

### Livello 3 — Ollama 7b solo per preventivo
`tryInterceptPreventivoHaikuFallback` (preventivo.js): quando Haiku fallisce
e c'è un preventivo `nexo_preventivi_pending`, cade su qwen2.5:**7b** perché
qui serve estrarre azioni complesse (modifica_iva, aggiungi_voce con descrizione
e importo, sconto, approva con sendByEmail). Timeout 50s.

## Modifiche codice

### `handlers/shared.js`
- Aggiunti `OLLAMA_URL`, `OLLAMA_MODEL_FAST="qwen2.5:1.5b"`, `OLLAMA_MODEL_SMART="qwen2.5:7b"`, `OLLAMA_KEY="nexo-ollama-2026"`.
- Nuova funzione `callOllamaIntent({system, user, model, maxTokens, timeoutMs})` con header `X-Nexo-Key` (placeholder auth) e `keep_alive: "30m"` per evitare unloading.
- `isHaikuTransientError(err)`: identifica errori per cui ha senso fallback (400/401/403/429/5xx, balance, rate limit, network).
- `extractFirstJSON(text)`: estrae primo `{...}` da output libero (Ollama spesso wrappa in code fence).

### `handlers/nexus.js`
- Nuova `callIntentRouter(apiKey, messages)`: try Haiku → catch transient → fallback Ollama 1.5b.
- Nuova `buildOllamaSystemPrompt()`: system prompt **compatto** (~800 token, vs 2k del NEXUS_SYSTEM_PROMPT completo) ottimizzato per qwen2.5:1.5b.
- Aggiunti `handleSalutoNexus` e `handleGrazieNexus` come DIRECT_HANDLERS canned (no LLM per "ciao" / "grazie").

### `handlers/preventivo.js`
- `tryInterceptPreventivoHaikuFallback`: try Haiku → catch transient → fallback Ollama qwen2.5:7b.
- Nuova `callOllamaPreventivoIntent`: prompt dedicato preventivo con schema JSON ridotto.

### `index.js` (`nexusRouter`)
- **Livello 1 first**: prima di chiamare LLM, prova `tryDirectAnswer` con intent vuoto. Se un DIRECT_HANDLER matcha sul `userMessage`, salta del tutto Haiku/Ollama.
- Se regex non matcha, chiama `callIntentRouter`.
- `timeoutSeconds: 90` (era 60) per assorbire fallback Ollama 7b cold-start.
- Nuovo campo response `intentSource ∈ {"regex", "haiku", "ollama"}` + `modello` dinamico per debug/monitoring.

### `handlers/forge.js` (`nexusTestInternal`)
- Stesso flusso 3-livelli per consentire test FORGE del fallback.

## Firewall ufw su `diogene`

```bash
ufw allow ssh           # 22
ufw allow 11434/tcp     # Ollama (no IP whitelist: CF Google IP non fissi)
ufw allow 3000/tcp      # Waha (cosa esistente)
ufw --force enable
```

Default deny incoming. SSH/Ollama/Waha aperti pubblicamente.
**Auth Ollama**: header `X-Nexo-Key: nexo-ollama-2026` mandato da CF, **Ollama
non lo verifica** (placeholder finché non setupiamo reverse proxy con auth vera).
Lo abbiamo introdotto ora come marker per logs/audit + per essere pronti.

## Test FORGE (POST a `/nexusTestInternal` con `X-Forge-Key`)

| # | Messaggio | Source | Modello | Tempo | Note |
|---|---|---|---|---|---|
| 1 | `ciao` | **regex** | regex | 3.4s | Canned reply, zero LLM |
| 2 | `interventi di Marco oggi` | **regex** | regex | 5.0s | ARES handler eseguito (365 card scansionate) |
| 3 | `guarda le mail` | **regex** | regex | 1.8s | IRIS handler email_recenti |
| 4 | `esposizione cliente Rossi` | **regex** | regex | 2.2s | CHARTA handler |
| 5 | `raccontami qualcosa di nuovo` | **ollama** | qwen2.5:1.5b@ollama | 18.5s | Haiku 400 → fallback Ollama, sistema risponde |
| 6 | `metti intervento a Federico domani al Kristal` | regex (ares intercept) | ares_crea_intervento | 0.9s | Fast-path ARES creazione |

**Tutti i test PASS.** Nota tempi:
- Regex L1: 1-5s (incluso Firestore/COSMINA query, non solo regex match).
- Ollama fallback 1.5b: ~18s warm. Cold start (modello unloaded dopo 30 min)
  può sforare i 30s — `keep_alive: 30m` mitiga ma non elimina. Il fallback è
  per emergenze (Haiku down/balance esaurito), non per traffico normale.
- Fast-path ARES: <1s (intercept pre-LLM via regex robusta).

## Stato attuale Anthropic Haiku

Balance esaurito (-0.03 USD da test precedente, auto-reload disabilitato).
**Tutto NEXUS continua a rispondere comunque**:
- Pattern frequenti → regex L1 (zero dipendenze)
- Pattern non coperti → Ollama 1.5b fallback (locale, gratis)
- Quando Alberto ricarica Anthropic, Haiku torna primario senza redeploy
  (si seleziona automaticamente quando l'API risponde 200).

## Cosa NON è stato rimosso

- `callHaikuForIntent` resta in `nexus.js` (è chiamato da `callIntentRouter`).
- `ANTHROPIC_API_KEY` come secret resta richiesto da `nexusRouter` (se manca,
  `callIntentRouter` va direttamente su Ollama).
- Le chiamate Haiku in `iris.js`, `calliope.js` e altri (per generazione email/
  bozze) NON sono toccate — quel path non era nel scope del task.

## Sicurezza

✅ ufw attivo, default deny, solo 22/3000/11434 aperti.
⚠️ Auth Ollama: solo header `X-Nexo-Key` come placeholder. Chiunque conosca
   l'IP può ancora consumare risorse del server. Da chiudere prima di
   aumentare il volume di chiamate.

**Mitigazioni residue da fare** (non bloccanti per il task):
1. Reverse proxy Caddy con basic auth davanti a Ollama, porta 11434 di nuovo
   solo su 127.0.0.1.
2. Cloudflare Tunnel (più sicuro, gratis).
3. Rate limiting esplicito (Ollama ha solo 1 request alla volta su CPU,
   ma DDoS può comunque saturare la coda).

## Prossimi passi suggeriti

1. **Monitoring Ollama**: PHARO check `GET /api/tags` per heartbeat.
2. **Cache few-shot per dominio ACG**: aggiungere 5 esempi specifici
   ("RTI" → pharo, "F-Gas" → dikea, "preventivo De Amicis" → orchestrator)
   nel system prompt Ollama per portare accuratezza routing al 95%+.
3. **Pre-warm in deploy**: aggiungere a `deploy.sh` un curl di warmup per
   qwen2.5:1.5b dopo il deploy, così il primo cold start non capita all'utente.
4. **Reverse proxy auth** Ollama (vedi sicurezza sopra).

## File coinvolti

- `projects/iris/functions/handlers/shared.js` — Ollama config + helpers
- `projects/iris/functions/handlers/nexus.js` — `callIntentRouter` + saluti regex
- `projects/iris/functions/handlers/preventivo.js` — fallback Ollama 7b preventivo
- `projects/iris/functions/handlers/forge.js` — flusso 3-livelli per test FORGE
- `projects/iris/functions/index.js` — `nexusRouter` regex-first + timeout 90s
- `results/feat-ollama-fallback-routing.md` — questo file
