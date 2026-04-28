# Analisi dev-request `dMfLuhguBDkdPrMN7SaS`

**Data:** 2026-04-28 14:56Z
**Tipo:** bug_from_chat — perdita contesto follow-up (duplicato semantico)
**Sessione:** `nx_qz97kl2umoiq9ljk`

## Sintesi

Sessione 2 turni:
1. "che interventi ha oggi marco?" → "Marco oggi ha in agenda un intervento
   il 28/04/2026: CONDOMINIO URBANITAS..." ✅
2. "solo quello?" → "Ciao, come posso aiutarti?" (stato `assegnata`) ❌

Il follow-up "solo quello?" è una richiesta di conferma del turno
precedente ("Marco ha solo l'URBANITAS oggi?"). NEXUS dovrebbe
rispondere "Sì, solo quello" oppure "Anche..." se c'è altro. Invece
risponde con un saluto generico fuori contesto.

## Stessa root cause della dev-request `02jXZTaAnPd4uzCAFrIZ`

**`callIntentRouter` (`nexus.js:1467-1503`) passa a `callGroqIntent`
solo l'ultimo turno utente, scartando la cronologia conversazionale.**

```js
// nexus.js:1469-1470
const lastUser = [...messages].reverse().find(m => m.role === "user");
const userText = lastUser ? String(lastUser.content || "") : "";
// ...
const r = await callGroqIntent({
  apiKey: groqKey,
  system: systemCompact,
  user: userText,           // ← SOLO "solo quello?", niente turno 1
  ...
});
```

Groq vede solo `"solo quello?"` senza sapere che il turno prima si
parlava di Marco e dei suoi interventi di oggi. Senza contesto sceglie
`{collega:"nessuno", azione:"chiarimenti"}` come fallback ragionevole.

L'analisi `02jXZTaAnPd4uzCAFrIZ.md` ha già proposto la fix completa.

## Verifica empirica via FORGE (eseguita ora)

Riprodotto 100% con sessione fresh:

| Turno | Source | Routing | Risposta | Stato |
|---|---|---|---|---|
| "che interventi ha oggi marco?" | regex L1 | ares/regex_match | Marco URBANITAS ✅ | completata |
| "solo quello?" | **groq L2** | **nessuno/chiarimenti** | "Posso aiutarti con qualcosa?" | assegnata |

`intentSource: "groq"`, `tookMs: 2226ms` (Groq risponde rapido), ma il
routing è inutile perché manca il contesto.

## File coinvolti (stessi della 02jXZTaA)

- `projects/iris/functions/handlers/nexus.js:1467-1503` — `callIntentRouter`
  scarta cronologia
- `projects/iris/functions/handlers/shared.js:callGroqIntent` — accetta
  solo `system` + `user` come stringhe singole
- `projects/iris/functions/index.js:561-563` — `loadConversationContext`
  carica gli ultimi 5 turni in `sessionContext` ma il router li butta via

## Proposta — già definita in `02jXZTaAnPd4uzCAFrIZ.md`

**Fix unica**:

1. Estendere `callGroqIntent` con parametro opzionale
   `history: Array<{role,content}>` che viene inserito tra system e
   l'ultimo user nei messages Groq.
2. `callIntentRouter` passa la cronologia (escluso ultimo user) come
   `history`.
3. Effetto: Groq vede l'intera conversazione, capisce "solo quello?"
   come follow-up sugli interventi di Marco e risponde correttamente.

```js
// shared.js (modifica callGroqIntent)
export async function callGroqIntent({
  apiKey, system, user, history = [],
  model = GROQ_MODEL, maxTokens = 400, timeoutMs = 15000, responseFormatJson = true
}) {
  if (!apiKey) throw new Error("no_groq_key");
  const messages = [{ role: "system", content: system }];
  for (const h of history.slice(-5)) {
    if (!h?.role || !h?.content) continue;
    messages.push({ role: h.role, content: String(h.content).slice(0, 1000) });
  }
  messages.push({ role: "user", content: user });
  // ... resto invariato
}

// nexus.js (modifica callIntentRouter)
const lastUserIdx = [...messages].reverse().findIndex(m => m.role === "user");
const lastUser = lastUserIdx >= 0 ? messages[messages.length - 1 - lastUserIdx] : null;
const userText = lastUser ? String(lastUser.content || "") : "";
const history = messages.slice(0, messages.length - 1 - lastUserIdx);
// passa history a callGroqIntent
```

## Contesto Groq con cronologia: cosa scoprirà

Con la fix, Groq vedrebbe:
```
[system] schema NEXUS + REGOLE
[user] che interventi ha oggi marco?
[assistant] Marco oggi ha in agenda un intervento il 28/04/2026: CONDOMINIO URBANITAS...
[user] solo quello?
```

Routing atteso: `{collega:"ares", azione:"interventi_aperti", parametri:{tecnico:"marco", data:"oggi"}, rispostaUtente:"Sì, Marco oggi ha solo l'intervento al CONDOMINIO URBANITAS — non ha altri interventi aperti."}`

NB: il modello potrebbe anche scegliere di rispondere conversazionalmente
("Sì, è l'unico per oggi.") senza ri-eseguire la query handler. Entrambi
gli esiti sono accettabili — meglio del "Ciao, come posso aiutarti?".

## Effort

Già stimato in `02jXZTaAnPd4uzCAFrIZ.md`: **S** (20-30 min) per Bug A
contesto + 10 min Bug B sentinelle "Tutti" + 15 min deploy/test = ~45 min.

Questa dev-request è **lo stesso commit**: la fix per "e oggi?" copre
anche "solo quello?" e in generale qualunque domanda ellittica
(`e dopo?`, `anche di domani?`, `e i pagamenti?`, `quanti in totale?`,
ecc.). Sono tutte forme di follow-up che richiedono contesto.

## Test plan aggiuntivo (oltre a 02jXZTaA)

```bash
TS=$(date +%s)
SID="forge-test-followup-${TS}"

# Turno 1: query con tecnico esplicito
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"che interventi ha marco oggi?\"}"

# Turno 2: domanda di conferma elliptical
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"solo quello?\"}"

# Atteso post-fix: source=groq con history → conferma "Sì, solo URBANITAS oggi"
# (NON "Ciao, come posso aiutarti?")

# Variante: "anche domani?"
curl ... -d "{\"sessionId\":\"${SID}-2\",\"message\":\"che interventi ha marco oggi?\"}"
curl ... -d "{\"sessionId\":\"${SID}-2\",\"message\":\"anche domani?\"}"
# Atteso: ARES con tecnico=Marco data=domani (eredita Marco)

# Variante: "ne ha altri?"
curl ... -d "{\"sessionId\":\"${SID}-3\",\"message\":\"interventi di Federico oggi\"}"
curl ... -d "{\"sessionId\":\"${SID}-3\",\"message\":\"ne ha altri?\"}"
```

## Stato

Bug **NON ancora risolto**. Fix proposta in `02jXZTaAnPd4uzCAFrIZ.md`
copre anche questo caso. Va implementata in un solo commit per chiudere
entrambe le dev-request (`02jXZTaA` "e oggi?" + `dMfLuhg` "solo quello?")
+ tutte le future varianti di follow-up ellittico.

## Pattern operativo

**Da quando Groq L2 è attivo** (deploy `10ab232` ore 14:30 circa), ogni
prompt che non matcha regex L1 va a Groq. Groq risponde rapidamente
(~2-3s) ma **con contesto vuoto** è cieco rispetto alla conversazione.

Le dev-request post Groq attivo (questa + `02jXZTaA`) condividono root
cause: contesto perso. Prima di Groq il bug esisteva ma era mascherato
dalla lentezza di Ollama 1.5b/7b che produceva comunque risposte
casuali (allucinazioni "Tutti non ha", "iris/email_urgenti" ecc.) — ora
Groq routa pulito a `nessuno/chiarimenti` ma altrettanto inutile.

**Priorità ALTA**: il follow-up ellittico è un pattern di chat normale.
Senza contesto, NEXUS è poco utilizzabile per conversazioni multi-turno.

## File da modificare (stessi di 02jXZTaA)

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/shared.js` | `callGroqIntent` | parametro `history` opzionale |
| `projects/iris/functions/handlers/nexus.js` | `callIntentRouter` 1469-1503 | passa cronologia (slice di `messages`) come `history` |

Effort totale: **S** (~30 min, già preventivato nella 02jXZTaA).
