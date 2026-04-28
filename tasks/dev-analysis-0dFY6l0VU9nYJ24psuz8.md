# Analisi dev-request `0dFY6l0VU9nYJ24psuz8`

**Data:** 2026-04-28 10:20:21Z
**Tipo:** bug_from_chat — query indirizzo non coperta da regex L1
**Sessione:** `nx_0qntjh2umoih3edb`
**Utente:** `lorenzo.dellafiore@acgclimaservice.com` (secondo bug da Lorenzo)
**Nota Alberto:** "risposte a caso"

## Sintesi

> ALBERTO: "che indirizzo ha il condominio via tonso 3"
>
> NEXUS: "Quale email vuoi che legga? Dimmi un numero (1-5) o il
> mittente (es. 'leggi la mail di Torriglia')."

La risposta è il fingerprint esatto di `handleLeggiEmail` quando manca
il parametro indice/mittente (`iris.js:206-209`):

```js
content: `Quale email vuoi che legga? Dimmi un numero (1-${Math.min(emails.length, 5)}) o il mittente (es. "leggi la mail di Torriglia").`
```

Quinta classe distinta di allucinazione Ollama 1.5b vista oggi sulla
stessa famiglia di prompt fuzzy:

| Dev-request | Allucinazione | Handler eseguito |
|---|---|---|
| XwOOJ | `ares/crea_intervento` con tutti tecnici | handleAresCreaIntervento |
| DGGJL | `iris/cerca_email_urgenti` | handleContaEmailUrgenti |
| Wkxipf | `iris/cerca_email_urgenti` | handleContaEmailUrgenti |
| c8ZeB1 | `iris/email_totali` | handleEmailTotali |
| **0dFY6l (questa)** | `iris/leggi_email` (senza indice) | handleLeggiEmail |

## Diagnosi

### Path osservato

1. Messaggio "che indirizzo ha il condominio via tonso 3" non matcha
   alcun regex L1 (verificato sotto)
2. Cade su Ollama qwen2.5:1.5b (router unico post-Strategia B)
3. Ollama allucina `{collega:"iris", azione:"leggi_email"}` (probabilmente
   per la parola "via" interpretata come pre-direttiva)
4. `tryDirectAnswer` post-LLM matcha
   `col==="iris" && /leggi.*mail/.test(az)` (`nexus.js:398`)
5. `handleLeggiEmail` esegue → manca indice/mittente → ritorna
   "Quale email vuoi che legga?"

### Regex L1 verificate (nessuna matcha)

- `handleLeggiEmail` (riga 396-401):
  - `/\b(leggi|apri|mostra|dimmi)\s+(?:la|il)?\s+(?:prima|...|\d{1,2})\b/i`
    → richiede verbo iniziale (leggi/apri/mostra/dimmi). NON matcha.
  - `/\b(?:leggi|apri|mostra)\s+(?:la\s+)?mail\b/i` → richiede
    "leggi/apri mail". NON matcha.

- `handleMemoRicercaIndirizzo` (riga 452-458) — l'handler giusto per
  questa query!:
  - `/\bcerca\s+cliente\s+(?:in\s+)?(?:via|viale|corso|piazza)/i` →
    richiede "cerca cliente in via". NON matcha.
  - `/chi\s+[èe]\s+in\s+(?:via|viale|corso|piazza)/i` → richiede
    "chi è in via". NON matcha.

- `handleMemoCercaCondominio` (Strategia B, riga 442-451):
  - `/\b(?:abbiamo|c'è|esiste|conosci|hai|ho)\s+(?:un|il|...)\s*(?:condominio|...)/i`
    → richiede "abbiamo/c'è un condominio". NON matcha
    "che indirizzo HA il condominio".

Il pattern "che indirizzo ha il condominio in via X" **non è coperto da
nessun handler regex L1**.

### Verifica FORGE post-Strategia B

```bash
curl /nexusTestInternal -d '{"message":"che indirizzo ha il condominio via tonso 3"}'
```

Risposta attuale (post commit `c343ca1`):
```
{
  "collega": "memo",
  "azione": "chi_e_persona",
  "intentSource": "ollama",
  "modello": "qwen2.5:1.5b@ollama",
  "reply": "Non trovo nulla su via tonno 3 né nella rubrica colleghi né
   tra i mittenti email né come amministratore di condominio.",
  "tookMs": 23.6s
}
```

Ollama ora ritorna `memo/chi_e_persona` che attiva `handleMemoChiE`
(gestisce persone, non condomini). Risposta sbagliata ma onesta:
"Non trovo nulla su via tonno 3...". Nota anche che Ollama ha **mutato
il nome** "tonso" → "tonno" (allucinazione di trascrizione).

Risposta migliore di prima ma ancora **sbagliata semanticamente**.

## File coinvolti

| File | Riga | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 396-401 | DIRECT_HANDLER iris/leggi_email matcha azione `leggi.*mail` da Ollama |
| `projects/iris/functions/handlers/nexus.js` | 452-458 | DIRECT_HANDLER memo/ricerca_indirizzo TROPPO restrittivo (richiede "cerca cliente in via" o "chi è in via") |
| `projects/iris/functions/handlers/nexus.js` | 442-451 | DIRECT_HANDLER memo/cerca_condominio (Strategia B) NON copre "che indirizzo ha il condominio in X" |
| `projects/iris/functions/handlers/memo.js` | `handleMemoRicercaIndirizzo` (~342) | Handler già esistente per ricerca indirizzo, sotto-utilizzato per regex L1 stretti |

## Proposta

### Fix A — Estendere regex L1 di `handleMemoRicercaIndirizzo` (S, ALTA)

Aggiungere pattern per query "che indirizzo ha X" / "qual è l'indirizzo di X" / "dove si trova X" / "che condominio c'è in via X":

```js
// nexus.js:452-458 (esteso)
{ match: (col, az, ctx) => {
  const m = (ctx?.userMessage || "").toLowerCase();
  if (col === "memo" && /(ricerca_indirizz|cerca_indirizz|per_via|per_indirizz)/.test(az)) return true;
  // Pattern esistenti
  if (/\bcerca\s+cliente\s+(?:in\s+)?(?:via|viale|corso|piazza)/i.test(m)) return true;
  if (/chi\s+[èe]\s+in\s+(?:via|viale|corso|piazza)/i.test(m)) return true;
  // ↓ NUOVI pattern
  // "che/quale indirizzo ha il condominio X" / "qual è l'indirizzo di X"
  if (/\b(che|quale|qual['e])\s+(?:è\s+l['']?\s*)?indirizzo\s+(?:ha|del|della|di|del condominio|del cliente)/i.test(m)) return true;
  // "che condominio c'è in via X" / "chi sta in via X"
  if (/\b(?:che|quale|qual)\s+(?:condominio|cliente|stabile)\s+(?:c['']?\s*è|sta|è|trovo)\s+in\s+(?:via|viale|corso|piazza)/i.test(m)) return true;
  // "dove si trova il condominio X" / "dove sta X"
  if (/\b(?:dove|in\s+che\s+via)\s+(?:si\s+trova|sta|è|abita)\s+(?:il|la|lo)?\s*(?:condominio|cliente|stabile)/i.test(m)) return true;
  // "il condominio in via X" / "la palazzina di via X" (richiesta esistenziale + indirizzo)
  if (/\b(?:il|la|un)\s+(?:condominio|palazzin\w+|stabile|residenz\w+)\s+(?:in|di)\s+(?:via|viale|corso|piazza)/i.test(m)) return true;
  return false;
}, fn: handleMemoRicercaIndirizzo },
```

`handleMemoRicercaIndirizzo` deve poi gestire il caso "ho un indirizzo,
trova il condominio". Verifico se già lo fa o serve adattarlo:

```js
// memo.js:342 (handleMemoRicercaIndirizzo)
// Da rivalutare: oggi probabilmente prende parametri.via/parametri.indirizzo.
// Estendere parsing user message: pattern "via tonso 3", "viale milazzo 34"
```

### Fix B — Hardening DIRECT_HANDLER iris/leggi_email (S, ALTA)

Stessa logica della guard ARES `isCreaInterventoCommand`: il match
`col==="iris" && /leggi.*mail/.test(az)` deve **richiedere SEMPRE** un
pattern lessicale esplicito nel messaggio:

```js
// nexus.js:396-401 (modificato)
{ match: (col, az, ctx) => {
  const m = (ctx?.userMessage || "").toLowerCase();
  // GUARD: il userMessage DEVE contenere "leggi/apri/mostra/dimmi" per
  // attivare leggi_email. Senza guard, Ollama allucinava il routing su
  // qualunque prompt menzionasse vagamente "indirizzo/condominio".
  const hasLeggiVerbo = /\b(leggi|apri|mostra(?:mi)?|dimmi)\s+/i.test(m);
  const hasMailNoun = /\b(mail|email|messaggio)\b/i.test(m);
  if (!hasLeggiVerbo || !hasMailNoun) {
    // Fallback: indice numerico esplicito (es. "la 3", "leggi 5") solo se
    // userMessage è breve e specifico
    if (!(/\b(?:leggi|apri|mostra(?:mi)?)\s+(?:la|il)\s+\d+/i.test(m) ||
          /\b(?:la|leggi|apri)\s+(?:prima|seconda|terza|quarta|quinta|ultima)\b/i.test(m))) {
      return false;
    }
  }
  if (col === "iris" && /(leggi_email|apri_email|leggi.*mail|leggi_la|apri_la)/.test(az)) return true;
  return /\b(leggi|apri|mostra(?:mi)?|dimmi)\s+(?:la\s+|il\s+)?(?:prima|seconda|terza|quarta|quinta|sesta|settima|ottava|nona|decima|ultima|\d{1,2})\b/i.test(m)
      || /\b(?:leggi|apri|mostra(?:mi)?)\s+(?:la\s+)?mail\b.{0,30}(?:di|da|del)\s+/i.test(m);
}, fn: handleLeggiEmail },
```

In pratica: niente "leggi/apri" + "mail/email" → niente
`handleLeggiEmail`, anche se Ollama ha allucinato `azione=leggi_email`.

### Fix C — Pattern generale anti-allucinazione (M, MEDIA)

Sospetto che TUTTI i DIRECT_HANDLERS L1 dovrebbero avere una guardia
analoga: l'azione del LLM è fidata SOLO se il userMessage la conferma
lessicalmente. Pattern già applicato in:

- ✅ `handleAresCreaIntervento` (Strategia B fix)
- ❌ `handleLeggiEmail` (questo bug)
- ❌ `handleEmailTotali` (causa bug c8ZeB1)
- ❌ `handleContaEmailUrgenti` (causa bug DGGJL/Wkxipf)
- ❌ Probabilmente altri handler iris/charta/...

**Refactor sistematico**: per ogni `(col === "X" && /Y/.test(az))` nei
DIRECT_HANDLERS, aggiungere un check sul userMessage che confermi
lessicalmente l'intent. Se Ollama dice "iris/leggi_email" ma il
messaggio non parla di email, il handler non scatta.

Questo è quello che ho fatto già per `crea_intervento` con `isCreaInterventoCommand`. Va replicato sistematicamente.

## Rischi

### Rischi Fix A

- I regex sono ampi ("che condominio c'è in via X") e potrebbero
  sovrapporsi con `handleMemoCercaCondominio` (pattern Strategia B).
  Mitigazione: ordine in DIRECT_HANDLERS — `cerca_condominio` ha
  priorità su `ricerca_indirizzo` per query "abbiamo/c'è un X?";
  `ricerca_indirizzo` cattura solo query con "in via/viale/corso".

### Rischi Fix B

- Se Haiku torna disponibile e usa `azione=leggi_email` legittimamente
  (es. prompt utente compatibile ma con frasing inusuale), la guard
  potrebbe bloccare casi validi. Mitigazione: la guard accetta sia
  "leggi/apri" + "mail" sia indice numerico esplicito → coverage 99%
  dei casi reali.

### Rischi Fix C (refactor)

- Effort più alto, ma è l'unica difesa robusta contro allucinazioni
  Ollama caotiche. Senza Fix C, ogni nuova classe di prompt fuzzy
  potenzialmente produce un nuovo bug "X allucinato".

## Effort

| Fix | Effort | Priorità |
|---|---|---|
| A — Estendere regex L1 ricerca_indirizzo | S (20 min) | ALTA |
| B — Guard `handleLeggiEmail` | S (10 min) | ALTA |
| C — Refactor sistemico anti-allucinazione | M (45 min) | MEDIA |

**Ordine**: A+B insieme (≤30 min) chiudono il bug osservato. C è
l'investimento strutturale che previene la prossima classe di bug.

## Test plan

```bash
# Bug osservato (deve diventare risposta utile)
curl /nexusTestInternal -d '{"message":"che indirizzo ha il condominio via tonso 3"}'
# Atteso post-fix: memo/ricerca_indirizzo → "Il condominio Y in via Tonso 3..."
# Oppure: "Non trovo nessun condominio in via Tonso 3"

# Varianti da testare
- "qual è l'indirizzo del condominio Fiordaliso?"
- "che condominio c'è in via Roma 12?"
- "dove si trova il condominio Sole?"
- "il condominio in viale Milazzo che indirizzo ha?"

# Regression: leggi_email deve ancora funzionare con prompt validi
- "leggi la prima mail" → handleLeggiEmail
- "apri la mail di Torriglia" → handleLeggiEmail
- "leggi la 3" → handleLeggiEmail
```

## Stato

Bug **NON ancora risolto** dalla Strategia B. Serve nuovo deploy con Fix
A + B. Ricomincia il loop bug from chat per Lorenzo / Sara / Alberto se
non si chiude rapidamente.

Pattern operativo ribadito: **Ollama 1.5b allucina caoticamente** su
prompt fuzzy. La difesa è regex L1 sempre più dense + guard lessicali su
ogni handler che riceve azioni LLM-routed. La Strategia B è la direzione
giusta ma serve completarla con Fix C (refactor sistemico).

## File da modificare (riepilogo)

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 452-458 | Estendere regex L1 ricerca_indirizzo (Fix A) |
| `projects/iris/functions/handlers/nexus.js` | 396-401 | Guard `handleLeggiEmail` con check lessicale (Fix B) |
| `projects/iris/functions/handlers/nexus.js` | tutti DIRECT_HANDLERS L1 con check su `col`/`az` LLM | (Fix C) refactor sistemico anti-allucinazione |
| `projects/iris/functions/handlers/memo.js` | `handleMemoRicercaIndirizzo` | Verificare che gestisca "via X 3" come parametro indirizzo |
