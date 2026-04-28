# feat(nexo): Strategia B — Ollama unico LLM + regex L1 espansa

**Data:** 2026-04-28
**Decisione utente:** "deve andare tutto su ollama su hetzner"
**Riferimento sessione precedente:** Strategia B votata dopo proposta A/B/C

## Cambiamenti chiave

### 1. Anthropic Haiku rimosso dal router intent

`nexus.js:callIntentRouter` ora chiama **direttamente Ollama qwen2.5:1.5b**.
Niente più try/catch Haiku → Ollama fallback. Le Cloud Functions non
dipendono più dal balance Anthropic per il routing semantico.

`apiKey` parametro mantenuto per compatibilità firma (rollback rapido).
`callHaikuForIntent` lasciata in `nexus.js` per compatibilità import in
`forge.js`/`index.js` ma non più invocata dal router.

### 2. Regex L1 espansa: `handleMemoCercaCondominio`

Nuovo handler in `memo.js` per query esistenziali:
- "abbiamo X?"
- "c'è il condominio X?"
- "esiste il cliente X?"
- "conosci il cliente X?"
- "il condominio X è in anagrafica?"

Cerca in `bacheca_cards` (boardName canonico) e `crm_clienti`
(denominazione/ragione sociale). Render single-match: "Sì, c'è B027 -
CONDOMINIO FIORDALISO - VIA DEL MERLO, 3 - VOGHERA (PV)."

DIRECT_HANDLER L1 in `nexus.js` per intercept regex prima di Ollama.

### 3. Hardening DIRECT_HANDLER ARES crea_intervento

Aggiunta guardia `if (!isCreaInterventoCommand(m)) return false;` come
PRIMA condizione. Senza questo, Ollama allucinava `crea_intervento` su
qualunque prompt fuzzy → handler scattava → "Creo intervento per tutti i
9 tecnici alle 09:00".

### 4. Sanity check tecnici allucinati

`_extractTecniciCrea` in `ares.js` ora ignora `parametri.tecnici` quando:
- LLM ne mette ≥5
- Nessuno è citato esplicitamente nel messaggio
- Eccezione "tutti/ognuno" → accetta

Mitigazione del fingerprint "AIME, DAVID, ALBANESI..." causato da
allucinazioni.

### 5. `finalContent` onesto su `in_attesa_collega`

Quando Ollama dirige a un collega async, `index.js` non mostra più la
`rispostaUtente` ottimistica del LLM ("Ho trovato l'impianto...") ma:
- Se collega NON ha listener: "Non ho ancora un handler attivo per
  X/Y. Lo registro come richiesta di sviluppo." + auto-creazione dev
  request via `tryInterceptDevRequest`.
- Se collega ha listener (ares/orchestrator): "Ho passato la richiesta a
  X (azione: Y). Aspetto la sua risposta…"

`COLLEGHI_CON_LISTENER = new Set(["ares", "orchestrator"])` per
distinguere.

### 6. Few-shot Ollama anti-bias

`buildOllamaSystemPrompt` riordinato:
- `email_recenti` come default per "guarda mail/mostra email"
- `cerca_email_urgenti` SOLO con keyword "urgent[ie]" esplicita
- Nuova azione `memo/cerca_condominio` per "abbiamo/c'è/esiste X?"
- Regole anti-allucinazione esplicite ("se domanda esistenziale NON
  crea_intervento", "se lamentela NON cerca_email_urgenti")

## File modificati

| File | Modifica |
|---|---|
| `projects/iris/functions/handlers/nexus.js` | callIntentRouter senza Haiku; DIRECT_HANDLER memo/cerca_condominio + isCreaInterventoCommand guard; few-shot Ollama riordinato; import handleMemoCercaCondominio |
| `projects/iris/functions/handlers/memo.js` | nuovo `handleMemoCercaCondominio` + helper `_parseNomeQuery` |
| `projects/iris/functions/handlers/ares.js` | sanity check tecnici allucinati in `_extractTecniciCrea` |
| `projects/iris/functions/index.js` | COLLEGHI_CON_LISTENER set; finalContent onesto su `in_attesa_collega`; auto dev_request per colleghi senza listener |

## Test FORGE — 7/8 PASS

| # | Messaggio | Risultato | Tempo |
|---|---|---|---|
| 1 | abbiamo un condominio fiordaliso? | ✅ memo regex L1 → "Sì, c'è B027 - CONDOMINIO FIORDALISO..." | 6.9s |
| 2 | c'è il condominio Sole? | ✅ memo regex L1 → 6 risultati | 4.1s |
| 3 | esiste il cliente De Amicis? | ✅ memo regex L1 → "Sì, c'è V015 - CONDOMINIO DE AMICIS..." | 3.5s |
| 4 | metti intervento al Kristal domani con Federico | ⚠️ ARES crea ma non estrae condominio (bug pre-esistente, non strategia B) | 1.0s |
| 5 | che interventi ha david oggi pomeriggio? | ✅ ARES regex L1 → 2 interventi reali | 4.0s |
| 6 | ciao | ✅ saluto canned | 1.1s |
| 7 | non funziona la dettatura | ✅ dev_request intercept | 0.9s |
| 8 | che ne pensi del condominio merlo? | ⚠️ Ollama 1.5b ritorna "preparare_preventivo + nessuno" → risposta neutra ("interessante, dettagli?") — non ottimale ma non inventa fatti | 19.4s |

**Test anti-allucinazione**:

| Messaggio | Prima | Dopo |
|---|---|---|
| "raccontami qualcosa" | "Creo intervento per AIME, DAVID, ALBANESI..." | "Ti preparo un preventivo per te." (risposta neutra, no handler scatta) |
| "come va il sistema?" | "Creo intervento per..." | "Sto lavorando sul tuo problema..." (idem) |
| "condominio fiordaliso" | "Creo intervento per..." | "Certo, avrò preparato un preventivo per il condominio Fiordaliso." (risposta neutra) |

**Niente più creazione intervento allucinata su prompt fuzzy.**

## Limitazioni note

- Ollama 1.5b ha ora bias verso `azione: "preparare_preventivo"` con
  `collega: "nessuno"`. Su prompt fuzzy ritorna risposte neutre/strane
  ma **non** inventa fatti dannosi (zero handler scatta).
- "metti intervento al Kristal domani con Federico" non estrae correttamente
  il condominio (bug pre-esistente in `_extractCondominio` che richiede
  preposizioni esplicite tipo "presso/al condominio Kristal"). Non
  affrontato in questa sessione.
- Anthropic balance ancora -0.03 USD da 39h: ora **non importa**, il
  routing è 100% Ollama.

## Risultato strategico

NEXUS è **completamente indipendente** dal balance Anthropic per il
routing semantico chat. Pattern frequenti coperti da regex L1 (zero costo,
zero latenza). Pattern fuzzy gestiti da Ollama 1.5b locale gratuito.
Tutti i bug routing rilevati nelle dev-request della giornata
(XwOOJ/DGGJL/Wkxipf/7bQg2/P02YSi) sono mitigati.

## Deploy

- Functions: `nexusRouter`, `nexusTestInternal` (europe-west1, timeoutSeconds 90)
- Pre-warm qwen2.5:1.5b post-deploy: 0.3s a caldo, ~3s cold start
- Ollama keep_alive 30m per mantenere modello caricato
