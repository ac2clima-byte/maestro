# Analisi dev-request `DGGJLDIgXAPDv7lbTpzk`

**Data:** 2026-04-28
**Tipo:** bug_from_chat — query trasformata in routing email urgenti
**Sessione:** `nx_9wfvdfnimoih0b9a`

## Sintesi

Sessione con 3 turni:
1. "ciao" → "Eccomi, cosa ti serve?" ✅ regex L1 saluto
2. "che interventi ha oggi pomeriggio david?" → lista corretta 2 interventi
   David ✅ (regex L1 ARES post fix Bug B di stamattina)
3. "abbiamo un condominio fiordaliso?" → "Hai 4 email urgente..." ❌

Il turno 3 ha lo stesso prompt della dev-request precedente
`XwOOJMSUlMvA0sC4bGfJ` ma una risposta DIVERSA: stavolta NEXUS dirige a
`iris/cerca_email_urgenti` invece di `ares/crea_intervento`. Stessa root
cause (mancanza handler `cerca_condominio` regex L1 + Ollama 1.5b
allucinazione) ma con un collega diverso a seconda di quale cosa Ollama
"pesca" dal prompt.

## Relazione con dev-request precedenti

**Identica per causa**: la query "abbiamo un condominio fiordaliso?" non
matcha alcun regex L1 → cade su Ollama 1.5b → allucinazione. Vedi analisi
completa in `tasks/dev-analysis-XwOOJMSUlMvA0sC4bGfJ.md`.

**Output diverso solo per casualità del modello**: qwen2.5:1.5b è
non-deterministico anche con `temperature=0` su prompt in cui non ha
ancorate strong → due chiamate consecutive possono dare collega diverso.
Il pattern visto è:
- Run 1 (XwOOJ): `ares/crea_intervento` con tutti i tecnici
- Run 2 (DGGJ): `iris/cerca_email_urgenti` (allucinazione differente)

Confermo che la **causa madre è una sola**: nessun regex L1 copre query
esistenziali "abbiamo/c'è/esiste un X?" → cadono su LLM → con Anthropic
balance esaurito da 39h → fallback Ollama 1.5b → allucinazione random.

## Bug aggiuntivi NON coperti dalle dev-analysis precedenti

### Bug nuovo — Bias Ollama 1.5b verso `iris/cerca_email_urgenti`

Il modello qwen2.5:1.5b è bias-ato verso questo intent. Già visto in:
- 7bQg2A ("Non funziona la dettatura vocale" → email urgenti)
- DGGJL ("abbiamo un condominio fiordaliso?" → email urgenti)

Probabile causa: nel `buildOllamaSystemPrompt` (`nexus.js:1428+`),
"cerca_email_urgenti" è il **primo esempio** nello schema `iris`. I modelli
piccoli tendono a scegliere il primo esempio listato come default per
prompt fuzzy.

**Fix proposta**: oltre alle fix XwOOJ già pianificate (handler
`cerca_condominio` + isCreaInterventoCommand guard), aggiungere in
`buildOllamaSystemPrompt`:

1. Riordinare gli esempi `iris` mettendo `email_recenti` (più generico)
   come primo, NON `cerca_email_urgenti`.
2. Aggiungere esempio negativo esplicito:
   ```
   - "abbiamo X / c'è X / esiste X?" → memo/cerca_condominio
   - "non funziona X" → tryInterceptDevRequest (NON iris)
   ```
3. Rinforzare la regola: "cerca_email_urgenti è SOLO quando l'utente
   menziona esplicitamente 'email/mail/posta urgenti'."

## File coinvolti

Stessi della dev-analysis `XwOOJMSUlMvA0sC4bGfJ` + uno nuovo per il bias:

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 497-501 | (già in XwOOJ) Guard `isCreaInterventoCommand` |
| `projects/iris/functions/handlers/ares.js` | 824-853 | (già in XwOOJ) Sanity check tecnici |
| `projects/iris/functions/handlers/memo.js` | nuovo | (già in XwOOJ) `handleMemoCercaCondominio` |
| `projects/iris/functions/handlers/nexus.js` | 440 (prima) | (già in XwOOJ) DIRECT_HANDLER L1 `cerca_condominio` |
| `projects/iris/functions/handlers/nexus.js` | 1428-1496 | **NUOVO**: riordino esempi few-shot, aggiungere "abbiamo X" → memo, rinforzare regola anti-bias `cerca_email_urgenti` |

## Proposta

**Riusa il piano della dev-analysis XwOOJMSUlMvA0sC4bGfJ (Fix 1+2+3)** +
aggiungi una piccola fix bias Ollama:

### Fix bias Ollama (S, ~10 min)

Modifica `buildOllamaSystemPrompt` in `nexus.js:1428+`:

**Prima**:
```
- iris (email): cerca_email_urgenti, email_oggi, email_totali, email_recenti, email_altre, leggi_email, ...
```

**Dopo**:
```
- iris (email): email_recenti (default per "guarda le mail"), email_oggi, email_totali, email_senza_risposta, leggi_email, cerca_email_urgenti (SOLO se l'utente dice "urgenti/urgente/mail urgenti")
```

E nelle REGOLE aggiungere:

```
- "abbiamo X / c'è X / esiste X / conosci X?" → memo/cerca_condominio
- "non funziona X / non parte X" → NON usare iris/cerca_email_urgenti
- cerca_email_urgenti SOLO con keyword "urgent[ie]" nel messaggio
```

### Effort

- Stesso della XwOOJ (S+S+M = ~90 min totali) + 10 min bias prompt = **~100 min**

## Rischi

Stessi della XwOOJ. Aggiungo: il riordino esempi few-shot Ollama allunga
leggermente il system prompt (~+50 token, ~+0.1s latenza per chiamata
Ollama 7b), trascurabile. Per 1.5b è quasi invariato.

## Riepilogo

- **Stessa root cause** della dev-request `XwOOJMSUlMvA0sC4bGfJ`.
- **Risposta diversa per casualità modello** (Ollama 1.5b non-deterministico).
- **Fix piano già completo** nella dev-analysis precedente (XwOOJ).
- **Aggiunta proposta**: hardening bias Ollama 1.5b verso
  `iris/cerca_email_urgenti` con riordino esempi e regole anti-bias nel
  system prompt.

Quando la sessione sta convergendo verso "Strategia B — Ollama unico LLM
+ regex L1 espansa" (decisione utente in chat), questa dev-request è una
conferma in più che servono **regex L1 dense** sui pattern frequenti
prima di delegare al modello locale.

## Stato

Da implementare assieme ai fix XwOOJ (un solo commit/deploy).
