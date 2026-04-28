# Analisi dev-request `c8ZeB1kqletcYkVgZO3w`

**Data:** 2026-04-28 10:17:55Z
**Tipo:** bug_from_chat — duplicato semantico (terza occorrenza giornaliera)
**Sessione:** `nx_14m84cokmo8b1aq8`
**Utente:** `lorenzo.dellafiore@acgclimaservice.com` — primo bug da Lorenzo
**Nota Alberto:** "la risposta non mi sembra inerente alla domanda"

## Sintesi

Conversazione con 2 turni:
1. "quali interventi ha oggi pomeriggio david" → 2 interventi reali ✅
   (regex L1 ARES con whitelist tecnici — funziona)
2. "abbiamo un condominio roma?" → "Ne ho indicizzate 115, l'ultima è
   arrivata il 26/04, 16:50." ❌

La risposta è il fingerprint esatto di `handleEmailTotali`
(`iris.js:252-260`):

```js
content: `Ne ho indicizzate ${emails.length}, l'ultima è arrivata il ${quando}.`
```

Il routing è andato a `iris/email_totali` invece di rispondere alla
domanda esistenziale sul condominio.

## Diagnosi

**Stessa root cause** delle 3 dev-request precedenti della giornata
(XwOOJ, DGGJL, Wkxipf):
1. Query "abbiamo un X?" non matchava nessun regex L1 (al momento del bug)
2. Cadeva su Ollama qwen2.5:1.5b (Anthropic balance esaurito da ~40h)
3. Ollama allucinava un collega/azione su prompt fuzzy

**Output diverso ad ogni run** (Ollama 1.5b non-deterministico anche con
temperature=0):
- XwOOJ → `ares/crea_intervento` con tutti i 9 tecnici
- DGGJL/Wkxipf → `iris/cerca_email_urgenti`
- **c8ZeB1 (questa)** → `iris/email_totali`

`tryDirectAnswer` post-LLM matchava `col==="iris" && /(total|conta_email|count|quant(e|it))/.test(az)` (`nexus.js:419`) → eseguiva
`handleEmailTotali` → "Ne ho indicizzate 115...".

## File coinvolti (al momento del bug)

| File | Riga | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/iris.js` | 252-260 | `handleEmailTotali` produce la risposta osservata |
| `projects/iris/functions/handlers/nexus.js` | 419 | DIRECT_HANDLER iris/totali matcha azione "total/conta/count/quant" da Ollama |
| `projects/iris/functions/handlers/nexus.js` | 1455-1485 | `callIntentRouter` cadeva su Ollama 1.5b (Haiku 400) |

## Stato implementazione

**La fix è già stata deployata** (commit `c343ca1`, "Strategia B —
Ollama unico LLM + regex L1 espansa", pochi minuti dopo questo bug):

- ✅ Nuovo `handleMemoCercaCondominio` in `memo.js`
- ✅ DIRECT_HANDLER L1 in `nexus.js` per "abbiamo/c'è/esiste un X?"
- ✅ Few-shot Ollama riordinato per ridurre bias verso `iris/email_totali`
  e `iris/cerca_email_urgenti`

**Verifica FORGE post-fix** (eseguita alle 10:18 ca, post-commit
`c343ca1`):

```bash
curl /nexusTestInternal -d '{"sessionId":"forge-test-c8ZeB1-postfix",
  "message":"abbiamo un condominio roma?"}'
```

Risposta:
```
{
  "collega": "memo",
  "azione": "regex_match",
  "intentSource": "regex",
  "reply": "Ho trovato 5 risultati per \"roma\":
    1. S033 - TORRAZZA COSTE – SCUOLE ELEMENTARI - VIA ROMA 45 - TORRAZZA COSTE (PV)
    2. Z026 - CONDOMINIO CARENZI (NOVI) - VIA ROMA, 52 - NOVI LIGURE (AL)
    3. CONDOMINIO ROMA VOGHERA — VIA GRAMSCI 47, VOGHERA
    4. ..."
}
```

Zero LLM, dati reali da `bacheca_cards` + `crm_clienti`.

## Aspetto qualitativo: substring match troppo lasco

La risposta post-fix per "roma" ritorna 5 risultati di cui alcuni
falsi positivi (es. "VIA ROMA 45" — la via si chiama Roma ma il
condominio non è "Roma"). Il match `_.toLowerCase().includes(qLow)` di
`handleMemoCercaCondominio` è **substring-match**, quindi qualunque
boardName che contenga "roma" come sottostringa (in indirizzo, città,
ecc.) matcha.

Questo non è un bug grave (i risultati sono comunque reali, non
allucinati), ma migliorabile:

### Possibili affinamenti (non urgenti)

1. **Ranking per posizione del match**: se "roma" è nella prima parola
   del nome (es. "CONDOMINIO ROMA"), peso maggiore. Se è in fondo o in
   un campo secondario (es. "VIA ROMA"), peso minore.

2. **Distinzione boardName vs indirizzo**: il match dovrebbe privilegiare
   il nome del condominio sul nome via. "CONDOMINIO ROMA" deve venire
   prima di "S033 - SCUOLE ELEMENTARI - VIA ROMA". Si può ottenere
   matchando solo la parte dopo l'eventuale codice (Bxxx/Sxxx/etc.) e
   prima del primo "-".

3. **Word-boundary match**: usare `\bquery\b` invece di `includes` per
   evitare match su sotto-parole ("orma", "amaroma", ecc.).

## File coinvolti (post-fix)

| File | Riga | Modifica suggerita (non urgente) |
|---|---|---|
| `projects/iris/functions/handlers/memo.js` | `handleMemoCercaCondominio` (~639-735) | rank con scoring word-boundary + posizione + boardName-first |

## Proposta

**Nessuna nuova fix urgente**: il bug osservato è già risolto dalla
Strategia B (commit `c343ca1`).

**Eventuale miglioramento opzionale**: scoring + ranking per
`handleMemoCercaCondominio` per ridurre falsi positivi tipo "VIA ROMA"
quando l'utente cerca "ROMA" come nome condominio. Effort S, priorità
LOW.

```js
// Pseudocodice scoring
function _scoreMatch(boardName, query) {
  const bn = boardName.toLowerCase();
  const q = query.toLowerCase();
  // Estrai parte centrale (dopo codice, prima primo "-" o ",")
  const central = bn.replace(/^[a-z]\d+\s*-\s*/, "").split(/\s*[-,]\s*/)[0];
  if (central === q) return 100;                  // Exact name
  if (central.startsWith(q + " ")) return 80;     // Inizia con
  if (new RegExp(`\\b${q}\\b`).test(central)) return 60; // Word match in nome
  if (new RegExp(`\\b${q}\\b`).test(bn)) return 30;       // Word match altrove (via, città)
  if (bn.includes(q)) return 10;                  // Substring match (basso)
  return 0;
}
```

E ordinare i match per score decrescente, prendere top-5.

## Effort

- Verifica fix già esistente: 0 (già fatto)
- Affinamento ranking (opzionale): **S** (~30 min)

## Stato

Dev-request **risolta automaticamente** dalla Strategia B (commit
`c343ca1`). Nessun nuovo deploy richiesto. L'eventuale affinamento
ranking è ottimizzazione opzionale.

## Pattern operativo

Questa è la **quarta dev-request consecutiva** (XwOOJ, DGGJL, Wkxipf,
c8ZeB1) sulla stessa frase "abbiamo un condominio X?" con risposte
diverse — tutte allucinazioni di Ollama 1.5b su prompt fuzzy.

Conferma che:
- L'output di Ollama 1.5b su prompt fuzzy è **caotico**, non
  prevedibile né bias-abile a un singolo intent
- L'unica difesa robusta è **regex L1 dense** che intercettino le query
  comuni prima del LLM
- La Strategia B (deploy `c343ca1`) è la risposta corretta a questa
  classe di bug

## Note utenti

Sessione di Lorenzo Dellafiore (tecnico ACG) — terzo utente diverso che
prova NEXUS oggi (Alberto, Sara, Lorenzo). I bug routing impattano
particolarmente i nuovi utenti: prima impressione sbagliata = abbandono.
Priorità Strategia B confermata corretta.
