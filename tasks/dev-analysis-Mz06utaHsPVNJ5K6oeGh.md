# Analisi dev-request `Mz06utaHsPVNJ5K6oeGh`

**Data:** 2026-04-29 06:21Z
**Tipo:** bug_from_chat — perdita contesto + range temporale ignorato
**Sessione:** `nx_xtxjfog5moixe5s4`

## Sintesi

> Turno 1: "che interventi ha oggi marco?" → ✅ "Marco oggi ha CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA (smontare boiler) — co-assegnato a FEDERICO"
>
> Turno 2: "e nei prossimi giorni?" → ❌ "**Tutti** non ha interventi pianificati per **mercoledì 29 aprile**"

Il follow-up "e nei prossimi giorni?" è un'ellissi che eredita **due cose** dal turno 1:
1. Tecnico = Marco (il `chi`)
2. Verbo "interventi" + range esteso "prossimi giorni" (il `cosa` + `quando`)

NEXUS ha perso entrambi:
- "Tutti" = filtro tecnico null → ha dimenticato Marco
- "mercoledì 29 aprile" = oggi → ha ignorato "prossimi giorni" e cercato solo OGGI

## Verifica empirica via FORGE (eseguita ora)

| Turno | Source | Routing | Stato | Tempo |
|---|---|---|---|---|
| 1: "che interventi ha oggi marco?" | regex L1 | ares/regex_match | completata | 6.2s ✅ |
| 2: "e nei prossimi giorni?" | **groq L2** | **chronos/agenda_giornaliera** | completata | 3.4s ❌ |

`intentSource: "groq"`, routato a chronos invece di ares + tecnico vuoto + range "oggi".

## Root cause — combinazione di 3 bug GIÀ analizzati

Questo bug **NON è nuovo**. Combina fingerprint di tre dev-analysis di ieri:

### Bug 1 — Contesto perso (analisi `02jXZTaAnPd4uzCAFrIZ.md`)

`callIntentRouter` in `nexus.js:1469-1470` passa a Groq solo l'ultimo
turno utente, scartando la cronologia. Groq vede "e nei prossimi giorni?"
isolatamente → non sa che si parlava di Marco.

**Fix proposta** (in `02jXZTaA`): aggiungere parametro `history` a
`callGroqIntent` e passarci `messages[]` dal router.

### Bug 2 — Groq routa "agenda" a chronos (analisi `OMpVg4L3rNnwPCHvUNjx.md`)

System prompt Groq elenca chronos come "agende/scadenze/campagne" →
"prossimi giorni" suggerisce "agenda" → Groq sceglie `chronos/agenda_giornaliera`.

Per ACG, le agende lavoro stanno in `bacheca_cards` (handled da ARES),
non in chronos. chronos serve solo per scadenze normative + campagne batch.

**Fix proposta** (in `OMpVg4L3`):
- regex L1 ARES con sinonimi appuntamenti/agenda/lavoro/impegni/giri/uscite
- system prompt Groq: "agenda di X / prossimi giorni" → ares NON chronos
- deprecare `handleChronosAgendaGiornaliera`

### Bug 3 — Sentinella "Tutti" (analisi `02jXZTaA` Bug B)

`handleChronosAgendaGiornaliera` (e in misura minore `handleAresInterventiAperti`)
quando `tecnico` è `null/"tutti"`, capitalizza la stringa cieca → "Tutti
non ha interventi" (grammaticalmente sbagliata).

**Fix proposta** (in `02jXZTaA`): blocklist `TECNICI_SENTINELLE = {"tutti", "tutte", "ognuno", "tecnici", "loro", ...}` in `_extractTecnico` e nel parsing `parametri.tecnico`.

### Bug 4 (NUOVO) — Range "prossimi giorni" non parsato

Anche se contesto + tecnico fossero corretti, "prossimi giorni" non è
parsato come range esteso. `parseRangeDataInterventi` (in
`projects/iris/functions/handlers/shared.js` o utils) ha pattern per
"oggi/domani/dopodomani/lunedì/[data]" ma non per "prossimi N giorni",
"settimana prossima", "questa settimana".

`handleChronosAgendaGiornaliera` (`chronos.js:582-596`) ha la sua
logica indipendente:

```js
let giorno = new Date();
if (/dopodomani/.test(msg)) giorno.setDate(giorno.getDate() + 2);
else if (/domani/.test(msg)) giorno.setDate(giorno.getDate() + 1);
else if (/oggi/.test(msg)) giorno = new Date();
```

Manca completamente parsing di range estesi (settimana, prossimi N giorni,
mese). Risultato: cade su `oggi` di default → "mercoledì 29 aprile".

## File coinvolti

| File | Riga | Bug |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 1469-1470 | Bug 1 — contesto buttato |
| `projects/iris/functions/handlers/shared.js` | `callGroqIntent` | Bug 1 — accetta solo `system+user` |
| `projects/iris/functions/handlers/nexus.js` | 1499-1556 | Bug 2 — Groq prompt routa "agenda" a chronos |
| `projects/iris/functions/handlers/nexus.js` | 530-552 | Bug 2 — regex L1 ARES non copre sinonimi |
| `projects/iris/functions/handlers/ares.js` | 232-233 | Bug 3 — no sanitize "tutti" |
| `projects/iris/functions/handlers/chronos.js` | 582-596 | Bug 4 — parsing range mancante |
| `projects/iris/functions/handlers/utils.js` o shared | `parseRangeDataInterventi` | Bug 4 — pattern incompleti |

## Proposta unificata

**Bug 1+2+3 sono già fixabili in un singolo commit** (proposta in
`02jXZTaA` + `OMpVg4L3`). **Bug 4 è specifico nuovo** e va aggiunto.

### Fix Bug 4 — Estendere parsing range temporali

In `parseRangeDataInterventi` (o equivalente):

```js
// Aggiungere pattern per range estesi
const m = String(input || "").toLowerCase();

// "prossimi N giorni" / "prossimi giorni" / "i prossimi giorni"
let nDays = 0;
const propsMatch = m.match(/\bprossimi\s+(\d+)?\s*giorni?\b/i);
if (propsMatch) {
  nDays = propsMatch[1] ? Number(propsMatch[1]) : 7;
  return {
    from: oggi(),
    to: addDays(oggi(), nDays),
    label: `prossimi ${nDays} giorni`,
  };
}

// "questa settimana"
if (/\bquesta\s+settimana\b/i.test(m)) {
  return {
    from: lunediQuestaSettimana(),
    to: domenicaQuestaSettimana(),
    label: "questa settimana",
  };
}

// "settimana prossima" / "la prossima settimana"
if (/\b(?:la\s+)?(?:prossima\s+settimana|settimana\s+prossima)\b/i.test(m)) {
  return { from: lunediProssimaSettimana(), to: domenicaProssimaSettimana(), label: "la prossima settimana" };
}

// "questo mese" / "questo mese in corso"
if (/\bquesto\s+mese\b/i.test(m)) {
  return { from: primoDelMese(), to: ultimoDelMese(), label: "questo mese" };
}
```

Effort: **S** (~30 min) — aggiungere helper date in `shared.js` (lunedì/
domenica della settimana corrente, primo/ultimo del mese in Europe/Rome).

### Effort totale (Bug 1+2+3+4)

- Bug 1 (contesto Groq): S (20-30 min) — già stimato
- Bug 2 (regex L1 sinonimi + Groq prompt): S (20-30 min) — già stimato
- Bug 3 (sentinelle "tutti"): S (10 min) — già stimato
- Bug 4 (range "prossimi giorni"): S (30 min) — nuovo
- Deploy + test FORGE multi-turno con range vari: S (15-20 min)

**Totale: ~2h** in single commit. Chiude tutte le 4 dev-request "context"
della giornata + previene future varianti ellittiche con range temporali.

## Test plan

```bash
TS=$(date +%s)
SID="forge-test-Mz06-${TS}"

# Turno 1: query con tecnico
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"che interventi ha oggi marco?\"}"
# Atteso: ARES regex, 1 intervento (CONDOMINIO STELLA A)

# Turno 2: ellissi con range esteso
curl ... -d "{\"sessionId\":\"$SID\",\"message\":\"e nei prossimi giorni?\"}"
# Atteso post-fix: ARES, tecnico=Marco (eredita), range=prossimi 7 giorni
# Risposta: "Marco nei prossimi 7 giorni ha N interventi: ..."

# Varianti
- "e questa settimana?" → ARES, tecnico ereditato, range settimana corrente
- "e domani?" → ARES, tecnico ereditato, range singolo giorno (già funziona post-fix Bug 1)
- "e venerdì?" → ARES, tecnico ereditato, range venerdì
- "ne ha altri?" → eredita tutto e mostra il resto

# Regression: query senza ellissi
- "interventi di tutti i tecnici domani" → ARES con includeAll=true (caso "tutti" intenzionale, deve passare)
```

## Rischi

- Modifica `parseRangeDataInterventi` impatta tutti i handler che la
  usano (ARES interventi_aperti, ARES creazione, CHRONOS scadenze, ecc.).
  Aggiungere pattern non rimuove pattern esistenti → rischio basso, ma
  da testare.
- Estensione regex L1 con sinonimi (Bug 2) può sovrapporsi a regex
  esistenti. Mitigazione: ordine in DIRECT_HANDLERS resta lo stesso,
  guard `isCreaInterventoCommand` resta priorità per creazione.
- Passare cronologia a Groq aumenta token per call (+50-100 token
  tipici, +50-100ms latenza). Free tier 14400/giorno comunque ampio.

## Stato

Bug **NON ancora risolto**. Le 4 fix proposte (Bug 1+2+3+4) sono
indipendenti l'una dall'altra ma vanno applicate insieme per chiudere
questa dev-request: anche risolvere solo Bug 1 (contesto) lascerebbe il
turno 2 sbagliato perché Groq routerebbe ancora a chronos (Bug 2) e
ignorerebbe "prossimi giorni" (Bug 4).

## Pattern operativo

Quarta dev-request consecutiva con sintomo "perdita contesto" da quando
Groq L2 è attivo (deploy `10ab232` di ieri pomeriggio):
- `02jXZTaA` "e oggi?" → "Tutti"
- `dMfLuhg` "solo quello?" → "Ciao"
- `OMpVg4L3` "appuntamenti" → chronos
- `Mz06utaH` (questa) "e nei prossimi giorni?" → "Tutti" + range sbagliato

**Tutte risolvibili dallo stesso commit** che implementa contesto Groq +
sinonimi + sentinelle. Il Bug 4 (range temporali) è il nuovo
contributo specifico di questa dev-request.

Priorità ALTA — l'utente sta usando NEXUS in modalità conversazionale
(turni multipli con riferimenti ellittici) ed è il pattern d'uso più
naturale. Senza queste fix, NEXUS resta un Q&A monoturno.
