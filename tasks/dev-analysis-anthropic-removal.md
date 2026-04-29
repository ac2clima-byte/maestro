# Dev Analysis — Migrazione completa Anthropic → Groq + Ollama

Data analisi: 2026-04-29
Origine: decisione conversazionale Alberto, sessione `nx_u1ytb30mmok15r3l`
("non dobbiamo più usare Anthropic, solo Groq e fallback Ollama")
Scope: rimozione totale di Anthropic da NEXO. Tutti i flussi LLM
girano su Groq (`llama-3.3-70b-versatile`) come primario e Ollama
self-hosted Hetzner (`qwen2.5:7b`) come fallback.

> **NON IMPLEMENTARE**: questo file è solo analisi. La decisione di
> rimuovere Anthropic ovunque è strategica e impatta flussi che vanno
> a clienti reali (preventivi CALLIOPE) — Alberto ha confermato il
> trade-off downgrade qualità accettato.

---

## 1. Inventario dei call site Anthropic in NEXO

### 1.1 In Cloud Functions (`projects/iris/functions/`)

| # | File:riga | Funzione | Modello attuale | Cosa fa |
|---|-----------|----------|-----------------|---------|
| 1 | `shared.js:41` | `MODEL` constant | `claude-haiku-4-5` | Costante globale Haiku |
| 2 | `shared.js:42` | `ANTHROPIC_URL` | endpoint | URL API Anthropic |
| 3 | `shared.js:12` | `ANTHROPIC_API_KEY` | defineSecret | Secret Manager |
| 4 | `shared.js:502 callHaiku()` | helper generico | Haiku | Chiamata sync system+user |
| 5 | `nexus.js:1421 callHaikuForIntent` | router NEXUS legacy | Haiku | Orfano da decisione 28/04 — già bypassato da `callIntentRouter` |
| 6 | `nexus.js:819 callHaikuShortPresent` | presentazione email coda | Haiku | "Leggi la prossima" → riassunto naturale email |
| 7 | `nexus.js: tryAnalyzeLongText` (~riga 1380) | analisi testi lunghi | Haiku | Quando Alberto incolla un testo lungo |
| 8 | `iris.js:534 handleIrisAnalizzaEmail` | classificazione email + estrazione strutturata | Haiku | Output JSON con intent + dati_estratti (preventivo/intervento/ecc.) |
| 9 | `echo-wa-inbox.js:44 callHaikuForWa` | classificazione WhatsApp inbound | Haiku | Output JSON con classificazione + summary |
| 10 | `nexus-audio.js:72 analyzeTranscript` | analisi trascrizione audio | Haiku | Post-Whisper: riassunto chiamata. Nota: la TRASCRIZIONE è OpenAI Whisper, NON Anthropic — Whisper resta. |
| 11 | `preventivo.js:147` | CALLIOPE arricchisciAzienda | Sonnet 4.6 | Estrae dati anagrafici azienda |
| 12 | `preventivo.js:331` | CALLIOPE genera bozza preventivo | Sonnet 4.6 | Output testo professionale per cliente |
| 13 | `preventivo.js:1450 callHaikuPreventivoIntent` | CALLIOPE intent recognition workflow | Haiku | Output JSON intent next-step |
| 14 | `preventivo.js:1988` | CALLIOPE step finale | Sonnet 4.6 | Output testo finale |
| 15 | `forge.js:89` | FORGE test interno | Haiku via callIntentRouter | Già passa per il router L2/L3 — copertura indiretta |

### 1.2 Fuori Cloud Functions (Hetzner)

| # | File:riga | Funzione | Modello | Note |
|---|-----------|----------|---------|------|
| 16 | `iris-poller.mjs:33-34` | classificazione email batch poller | Haiku | Gira su Hetzner ogni 5 min, classifica email entrata IMAP/EWS. Va aggiornato lì in parallelo. |

### 1.3 Configurazioni `secrets:[]` da rimuovere/sostituire

`projects/iris/functions/index.js` riferimenti a `ANTHROPIC_API_KEY`
nei `secrets:` di varie funzioni:
- riga 122 `nexusRouter` (verificare, qui è quello principale)
- riga 210 (forse `nexusTestInternal` — legacy)
- riga 1122 `irisPollerScheduled` (scheduler ogni 5 min)
- riga 1138 (handler email)
- riga 1628, 1642
- riga 1713 (`nexusTranscribeAudio`)
- riga 1935 (`calliopePreventivo` — serve per arricchisciAzienda + Sonnet)

Inoltre `forge.js:56` → `secrets: [ANTHROPIC_API_KEY, FORGE_KEY]`.

Tutti questi vanno sostituiti con `[GROQ_API_KEY]` (o lasciati vuoti
sui secrets LLM per le funzioni che usano solo Ollama).

---

## 2. Strategia di migrazione

### 2.1 Principio generale

Per ogni call site Anthropic introdurre un nuovo helper `callLLM(...)`
che incapsula la logica già esistente in `callIntentRouter`:

```text
1. Se GROQ_API_KEY disponibile → chiama callGroqIntent()
2. Su errore transient (429/5xx/rete) → fallback callOllamaIntent()
3. Su errore permanent (400/401) → rilancia
```

L'helper centrale evita duplicazione e garantisce comportamento
omogeneo di retry/timeout/JSON parsing.

### 2.2 Posizionamento dell'helper

Aggiungere in `shared.js`, accanto a `callGroqIntent` e
`callOllamaIntent` esistenti, una nuova funzione `callLLM`:

```js
// shared.js — proposta
export async function callLLM({
  system,
  user,
  // tipo di output
  responseFormatJson = false,
  // limiti
  maxTokens = 1024,
  // timeout per ciascun tentativo
  groqTimeoutMs = 15000,
  ollamaTimeoutMs = 50000,
  // override modello
  groqModel = GROQ_MODEL,
  ollamaModel = OLLAMA_MODEL_FALLBACK,
} = {}) {
  const groqKey = getGroqApiKey();
  if (groqKey) {
    try {
      const r = await callGroqIntent({
        apiKey: groqKey,
        system, user,
        model: groqModel,
        maxTokens,
        timeoutMs: groqTimeoutMs,
        responseFormatJson,
      });
      return { text: r.text, usage: r.usage, source: "groq" };
    } catch (e) {
      if (!isGroqTransientError(e)) throw e;
      logger.warn("callLLM groq transient, falling back to ollama", { error: String(e).slice(0, 200) });
    }
  }
  // L3 Ollama
  const r = await callOllamaIntent({
    system,
    user: responseFormatJson
      ? `${user}\n\nRispondi SOLO con JSON valido, niente prosa.`
      : user,
    model: ollamaModel,
    maxTokens,
    timeoutMs: ollamaTimeoutMs,
  });
  return {
    text: r.text,
    usage: { ollama_duration_ms: Math.round((r.durationNs || 0) / 1e6), model: ollamaModel },
    source: "ollama",
  };
}
```

Questa è l'unica primitive che deve restare: `callHaiku` (riga 502)
sparisce, `callHaikuForIntent` (nexus.js:1421) sparisce,
`callHaikuShortPresent`, `callHaikuForWa`, `callHaikuPreventivoIntent`
diventano tutti wrapper sopra `callLLM` con prompt specifici.

### 2.3 Nuovi secret da configurare

Prima di qualsiasi deploy:

```bash
# Configura GROQ_API_KEY (se non già fatto)
firebase functions:secrets:set GROQ_API_KEY --project nexo-hub-15f2d

# Verifica esistenza
firebase functions:secrets:get GROQ_API_KEY --project nexo-hub-15f2d
```

E in `shared.js`:

```js
// Riga 12 — sostituire con:
export const GROQ_API_KEY = defineSecret("GROQ_API_KEY");
// ANTHROPIC_API_KEY: rimossa
// MODEL: rimossa (claude-haiku-4-5 non più usato)
// ANTHROPIC_URL: rimossa
```

`getGroqApiKey()` (riga 33) può restare ma cambiare implementazione
per leggere da `GROQ_API_KEY.value()` invece di `process.env`:

```js
export function getGroqApiKey() {
  try {
    return GROQ_API_KEY.value() || null;
  } catch {
    return process.env.GROQ_API_KEY || null;
  }
}
```

### 2.4 Migrazione call site per call site

Ordine consigliato (da meno rischioso a più rischioso):

| Ordine | Call site | Difficoltà | Output schema | Note migrazione |
|--------|-----------|-----------|---------------|-----------------|
| 1 | `callHaiku` (shared.js:502) | banale | testo | Marca @deprecated, redirige a `callLLM` per backward compat finché tutti i caller migrano |
| 2 | `callHaikuForIntent` (nexus.js:1421) | banale | JSON | Legacy, già non chiamata. Rimuovere insieme alle import morte. |
| 3 | `forge.js` (riga 89) | banale | JSON intent | Usa già `callIntentRouter`. Solo togliere `ANTHROPIC_API_KEY` da `secrets:[]` (riga 56) |
| 4 | `callHaikuShortPresent` (nexus.js:819) | bassa | testo italiano breve | Wrapper su `callLLM(responseFormatJson:false)`. Test FORGE su 5 email reali per qualità output. |
| 5 | `tryAnalyzeLongText` (nexus.js ~1380) | bassa | testo | idem |
| 6 | `callHaikuForWa` (echo-wa-inbox.js:44) | media | JSON con schema preciso | Groq supporta `response_format:json_object`. Test su 10 WA reali (intent recognition + summary). Whitelist intent ammessi nello schema per ridurre allucinazioni. |
| 7 | `callHaikuPreventivoIntent` (preventivo.js:1450) | media | JSON intent next-step | idem |
| 8 | `handleIrisAnalizzaEmail` (iris.js:534) | alta | JSON con schema multilivello (intent + dati_estratti.preventivo / intervento / ecc.) | Punto più sensibile lato classificazione. Test FORGE: 20 email storiche con etichetta nota → confronto JSON output. |
| 9 | `analyzeTranscript` (nexus-audio.js:72) | bassa | testo | Whisper resta (OpenAI). Solo l'analisi post-trascrizione passa a Groq. |
| 10 | `preventivo.js:147` arricchisciAzienda | media | JSON dati anagrafici | Test su 5 aziende note: estrazione P.IVA, ragione sociale, indirizzo |
| 11 | `preventivo.js:331,1988` generazione bozza preventivo | **ALTA** | testo lungo italiano professionale | **DOWNGRADE QUALITÀ accettato da Alberto.** llama-3.3-70b è competente in italiano ma meno polished di Sonnet 4.6 su registro formale. Test FORGE: 3 preventivi reali storici → confronto output side-by-side. Considerare prompt engineering aggiuntivo (esempi few-shot). |
| 12 | `iris-poller.mjs:33-34` Hetzner | media | JSON classificazione email | Update separato sul server Hetzner. Vedi §3. |

---

## 3. Modifiche al poller Hetzner (`iris-poller.mjs`)

Il file `projects/iris/functions/iris-poller.mjs` **non gira su
Cloud Functions** — è uno script Node che gira sul server Hetzner
(stesso host di Ollama, `168.119.164.92`), avviato da systemd o cron.

Modifiche necessarie:

1. Sostituire `ANTHROPIC_URL` + `CLASSIFY_MODEL` con `GROQ_URL` +
   `GROQ_MODEL`.
2. Riusare la stessa logica del helper Cloud Function — ma siccome
   non c'è import da `shared.js`, va replicata o estratta in un
   modulo condiviso.
3. Variabili ambiente nel `.env` Hetzner:
   - `GROQ_API_KEY=xxx` (nuova)
   - rimuovere `ANTHROPIC_API_KEY`
4. Per il fallback Ollama: il poller gira già SULLO STESSO host di
   Ollama, quindi può usare `OLLAMA_URL=http://localhost:11434`
   (zero latenza rete) — vantaggio rispetto alle Cloud Functions.
5. Restart del servizio dopo deploy:
   ```bash
   ssh hetzner "sudo systemctl restart iris-poller"
   ```

**Rischio specifico Hetzner**: se Groq fallisce e Ollama è OK, il
poller continua a classificare email senza interruzione. Se entrambi
falliscono, le email vengono parcheggiate con `category: "PENDING"` →
Alberto le vede in dashboard ma niente è perso.

---

## 4. Schema di test pre-deploy

Per ogni call site migrato (quelli con difficoltà ≥ media), test
side-by-side prima del deploy in produzione:

### 4.1 Test FORGE (`nexusTestInternal`)

```bash
# Esempio per IRIS classificazione
curl -X POST https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal \
  -H "Content-Type: application/json" \
  -d '{
    "userMessage": "analizza questa email: [testo email reale]",
    "forgeKey": "nexo-forge-2026",
    "sessionId": "forge-test-anthropic-migration"
  }'
```

### 4.2 Diff strutturale

Per i call site con output JSON:
1. Eseguire la chiamata su Anthropic (pre-migrazione, baseline)
2. Eseguire la chiamata su Groq (post-migrazione)
3. Diff dei JSON con `jq -S` (ordinato per chiave)
4. Accept criteria:
   - Stessi top-level keys (collega, azione, parametri / intent, dati_estratti)
   - Valori `parametri.tecnico|cliente|importo` identici al 90% sui campioni
   - Differenze solo su `rispostaUtente` / campi testo libero

### 4.3 Test qualità testo libero (preventivi CALLIOPE)

Per i 3 preventivi reali storici di test:
1. Generare con Anthropic Sonnet 4.6 (output A — baseline)
2. Generare con Groq llama-3.3-70b (output B)
3. Alberto valuta side-by-side tono, completezza, registro
4. Se output B è inaccettabile su >1 caso → considerare:
   - Prompt engineering più aggressivo (system prompt esteso con
     esempi di preventivi storici approvati)
   - Modello Groq alternativo (`mixtral-8x7b-32768` se llama-3.3-70b
     poco creativo)

### 4.4 Pagina HTML risultati test

Conformemente alle regole MAESTRO ("MAI salvare risultati solo su
disco senza mostrarli visivamente"), generare una pagina HTML che
mostri:
- Tabella dei 12 call site con stato migrazione
- Per ognuno: input, output Anthropic baseline, output Groq, diff
- Tasto "OK / NO" per Alberto su ogni caso
- Aprire automaticamente con `cmd.exe /c start <path>`

---

## 5. Effort, rischi, alternative

### 5.1 Effort stimato

| Macro-step | Effort | Note |
|-----------|--------|------|
| Setup `GROQ_API_KEY` su Secret Manager + `defineSecret` in shared.js | S | 15 min |
| Helper `callLLM` in shared.js | S | 30 min |
| Migrazione 1-3 (call site banali) | S | 1h |
| Migrazione 4-5 (testo libero corto) | S | 1h |
| Migrazione 6-7 (JSON con schema) | M | 3h con test FORGE |
| Migrazione 8 (handleIrisAnalizzaEmail) | M | 3h con regression test su email storiche |
| Migrazione 9-10 (audio + arricchisciAzienda) | M | 2h |
| Migrazione 11 (CALLIOPE preventivi) | **L** | mezza giornata: prompt eng + test side-by-side + iterazioni |
| Migrazione 12 (Hetzner poller) | M | 2h: edit + ssh + restart + monitor logs 1h |
| Update `secrets:[]` su tutte le Cloud Functions in index.js | S | 30 min |
| Test end-to-end + deploy | M | 2h |

**Totale: L** (1.5-2 giornate sviluppo + monitoring 24h post-deploy).

### 5.2 Rischi

- **R1 — Qualità preventivi CALLIOPE**: llama-3.3-70b può produrre
  preventivi meno raffinati di Sonnet 4.6. Mitigazione: prompt
  engineering + few-shot examples + Alberto rivede SEMPRE prima di
  inviare al cliente. Workflow approvazione in
  `calliope_bozze.status=da_approvare` resta intatto.
- **R2 — Classificazione email IRIS regression**: se llama
  classifica peggio degli intent attuali, email finiscono in
  categorie sbagliate o `ALTRO`. Mitigazione: schema JSON con enum
  fisso degli intent ammessi + `responseFormatJson:true` + test su
  20 email storiche.
- **R3 — Latenza Groq**: 200-500ms vs 800-1500ms Anthropic Haiku →
  miglioramento. Ma se Groq è giù e si cade su Ollama (CPU EPYC
  Hetzner) → 8-15s a caldo, 25s cold start. PWA NEXUS potrebbe
  sembrare lenta. Mitigazione: indicator UI "sto pensando..." già
  presente; consider rate-limit Groq fallback strategy con Mistral
  Small su OpenRouter come L2.5 se serve.
- **R4 — Costo Groq vs Anthropic**: piano gratuito Groq = 14400
  req/giorno. NEXO consuma circa 200-400 req/giorno (stima da log
  recenti) → ampio margine. Se supera quota: fallback Ollama gratis.
- **R5 — Single point of failure Ollama**: l'host Hetzner Ollama è
  *unico*. Se va giù **e** Groq è giù, NEXO è muto. Mitigazione: già
  presente — quando Ollama è down `callLLM` ritorna errore esplicito
  e il chiamante mostra "Sistema temporaneamente non disponibile".
  Non peggiora la situazione attuale: oggi se Anthropic è giù è la
  stessa cosa.
- **R6 — JSON parsing edge cases**: llama-3.3-70b a volte aggiunge
  spiegazione prima/dopo il JSON anche con `response_format`.
  Mitigazione: la funzione `extractJSON` (nexus.js:260) già gestisce
  code fence + estrazione tra `{...}`. Robusto.
- **R7 — Dimenticare di aggiornare `secrets:[]` in `index.js`**: la
  Cloud Function deployata ha ancora `ANTHROPIC_API_KEY` nei secrets
  ma il codice lo ignora — non è un errore ma è confusionale.
  Cleanup richiesto in `index.js` su tutte le 6+ funzioni
  identificate al §1.3.

### 5.3 Alternative

- **A1 — Migrazione graduale con feature flag**: tenere temporaneamente
  entrambe le strade (Anthropic + Groq) dietro flag
  `USE_ANTHROPIC=true|false` per ogni call site. Permette rollback
  veloce. Pro: sicurezza. Contro: doppio codice da mantenere; va
  contro la richiesta esplicita di Alberto ("rimuovere Anthropic").
- **A2 — Fallback chain L2 esteso**: Groq → OpenRouter (gateway
  multi-provider, ~$5/mese) → Ollama. Riduce R5. Contro: aggiunge
  dipendenza, oggi non richiesta.
- **A3 — Solo migrazione classificazione (NEXUS+IRIS+ECHO), tenere
  CALLIOPE su Sonnet**: il punto più sensibile (preventivi a clienti)
  resta Anthropic, il resto va su Groq. Pro: rischio quasi nullo.
  Contro: NON è quello che Alberto ha chiesto ("tutto su Groq").
- **A4 — Modello Groq più potente per CALLIOPE**: usare
  `llama-3.3-70b-versatile` per intent + classificazione, ma
  `qwen-2.5-32b` o `gemma2-9b-it` per generazione preventivi se uno
  di questi rende meglio in italiano commerciale. Test A/B richiesto.

**Raccomandazione finale**: procedere come da §2 (migrazione
totale, ordine 1→12), con FOCUS particolare al call site #11
(CALLIOPE). Se Alberto non è soddisfatto della qualità output #11
nei test FORGE side-by-side, si valuta in quel momento se rollback
(A3) o switch a modello Groq alternativo (A4).

---

## 6. File da modificare (riepilogo)

```
projects/iris/functions/
├── handlers/
│   ├── shared.js          → -ANTHROPIC_API_KEY, -ANTHROPIC_URL, -MODEL,
│   │                        -callHaiku, +GROQ_API_KEY (defineSecret),
│   │                        +callLLM helper
│   ├── nexus.js           → -callHaikuForIntent, callHaikuShortPresent
│   │                        e tryAnalyzeLongText migrati a callLLM
│   ├── iris.js            → handleIrisAnalizzaEmail migrato a callLLM
│   ├── echo-wa-inbox.js   → callHaikuForWa migrato a callLLM
│   ├── nexus-audio.js     → analyzeTranscript migrato a callLLM
│   ├── preventivo.js      → 4 call site (147, 331, 1450, 1988) migrati
│   │                        a callLLM. CALLIOPE_MODEL rimossa.
│   └── forge.js           → -ANTHROPIC_API_KEY da secrets:[], import cleanup
├── index.js               → secrets:[ANTHROPIC_API_KEY] sostituiti con
│                            secrets:[GROQ_API_KEY] su 7+ funzioni
└── iris-poller.mjs        → fetch Groq invece di Anthropic + .env update
                            (cambio anche su Hetzner via ssh)
```

Nessun cambio a:
- Schema Firestore
- Firestore rules / IAM / GDPR
- PWA frontend (`projects/nexo-pwa/`)
- ECHO WhatsApp (Waha) / Diogene / Guazzotti TEC
- Whisper OpenAI (resta come trascrittore audio)

---

## 7. Pre-flight check (da eseguire prima di iniziare)

1. ✅ Groq API endpoint raggiungibile: HTTP 401 in 357ms con dummy key
   (verificato 2026-04-29).
2. ❌ `GROQ_API_KEY` su Secret Manager `nexo-hub-15f2d` → **NON
   ESISTE** (verificato `firebase functions:secrets:get GROQ_API_KEY`
   = 404). **DEVE essere creato come PRIMO step**.
3. ✅ Ollama Hetzner raggiungibile: `http://168.119.164.92:11434/api/tags`
   HTTP 200 in 110ms (verificato 2026-04-29).
4. ⚠️ Quota Groq piano gratuito = 14400 req/giorno. Stima consumo
   NEXO attuale = 200-400/giorno. Ampio margine ma da monitorare
   post-migrazione (handleIrisAnalizzaEmail + iris-poller possono
   consumare più del previsto).

Niente altro da implementare ora. Aspetto conferma o ulteriori
istruzioni di Alberto prima di passare alla fase implementativa.
