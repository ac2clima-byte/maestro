# Analisi dev-request `OMpVg4L3rNnwPCHvUNjx`

**Data:** 2026-04-28 14:34Z
**Tipo:** bug_from_chat — sinonimo "appuntamenti" non coperto + handler chronos divergente da ARES
**Sessione:** `nx_deshoqohmoiq8wj4`

## Sintesi

> ALBERTO: "che appuntamenti ha david oggi ?"
>
> NEXUS: "Aime david non ha interventi pianificati per martedì 28 aprile."

**Risposta sbagliata**: David ha effettivamente avuto 4 interventi oggi
(28/04/2026), di cui:
- 3 eseguiti: TURATI 9 spegnimento, MAZZINI Stazzano, VENERE Tortona
- 1 ancora aperto: SAN GIOVANNI 5 Arquata Scrivia (Ticket 929/2026)

Ho verificato chiamando direttamente FORGE con 3 prompt diversi:

| Prompt | Routing | Risposta |
|---|---|---|
| "che appuntamenti ha david oggi?" | **Groq → chronos/agenda_giornaliera** | 0 risultati ❌ |
| "che interventi ha david oggi" | **regex L1 → ares/interventi_aperti** | 1 aperto ✅ |
| "che interventi ha david oggi anche chiusi" | regex L1 → ares con includeTerminali | 4 totali (3 chiusi + 1 aperto) ✅ |

**Tre bug concatenati** che si combinano sul prompt dell'utente.

---

## Bug A — Regex L1 ARES non copre "appuntamenti"

### Causa

`projects/iris/functions/handlers/nexus.js:530-552` — DIRECT_HANDLER L1
per `handleAresInterventiAperti` cerca **sempre la parola letterale
"intervent[io]"** in tutti i pattern:
- `\bintervent[io]\s+(?:apert[io]\s+)?(?:di|del|per)\s+...` (riga 536)
- `\bintervent[io]\s+(?:di\s+)?oggi\b` (riga 537)
- `\b(che|quali|quanti|cosa|come)\b.*\bintervent[io]\b` (riga 540)
- `\bintervent[io]\b ... data` (riga 542)
- `\b(?:ci sono|c'è|abbiamo)\b.*\bintervent[io]\b` (riga 544)
- `tecnRe ... \bintervent` (riga 547-548)

"appuntamenti", "agenda", "lavoro", "impegni", "uscite" sono sinonimi
naturali che **non scattano** nessun regex → fallback Groq L2.

### Conseguenza

Senza regex L1 deterministico, l'intent è scelto da Groq. Anche con
modello potente (llama-3.3-70b), la scelta del **collega** è ambigua:
- "appuntamenti" → suggerisce `chronos/agenda_giornaliera` (calendario)
- "interventi" → suggerisce `ares/interventi_aperti` (bacheca lavoro)

Groq stamattina (post `c343ca1`) sceglie chronos. Sbagliato per il
dominio ACG: appuntamenti = interventi sul campo, non eventi calendario.

### File coinvolti

- `projects/iris/functions/handlers/nexus.js:530-552` — regex L1 ARES
- `projects/iris/functions/handlers/nexus.js:1525-1530` — system prompt
  Groq elenca `chronos/agenda_giornaliera` con descrizione "agende"
- `projects/iris/functions/handlers/chronos.js:576+` — handler agenda

### Proposta Fix A — Espandere regex L1 con sinonimi

```js
// nexus.js:530-552 (esteso)
{ match: (col, az, ctx) => {
  const m = (ctx?.userMessage || "").toLowerCase();
  if (isCreaInterventoCommand(m)) return false;
  if (col === "ares" && /(intervent|apert|attiv|...)/.test(az)) return true;
  // Sinonimi: "appuntament[io]", "agenda", "lavor[oi]", "impegn[oi]",
  // "uscit[ae]", "giro", "giri" → trattali come "interventi" su ARES
  // (NON chronos: per ACG le agende sono in bacheca_cards, non in
  // calendario separato).
  const SINONIMI_INTERVENTI = "(?:intervent[io]|appuntament[io]|agend[ae]|lavor[oi]|impegn[oi]|uscit[ae]|gir[oi])";
  const reSino = new RegExp(`\\b${SINONIMI_INTERVENTI}\\b`, "i");
  if (reSino.test(m)) {
    // Riapplica gli stessi pattern del regex originale ma con sinonimi
    const dataRe = /\b(oggi|domani|dopodomani|ieri|...)\b/i;
    if (/\b(che|quali|quanti|cosa|come|quale)\b.*/.test(m) && dataRe.test(m)) return true;
    if (reSino.test(m) && dataRe.test(m)) return true;
    if (/\b(?:ci\s+sono|c['']?\s*è|c['']?\s*sono|abbiamo)\b/.test(m)) return true;
    const tecnRe = /\b(aime|david|albanesi|...|malvicino)\b/i;
    if (tecnRe.test(m)) return true;
  }
  // ... resto invariato
}, fn: handleAresInterventiAperti }
```

In alternativa, refactor più pulito: estraggo la regex SINONIMI in una
costante e la sostituisco a `intervent[io]` in tutti i pattern.

### Effort: **S** (15-20 min)

---

## Bug B — Groq routa "appuntamenti" a chronos invece di ares

### Causa

Il system prompt Groq in `buildOllamaSystemPrompt` (`nexus.js:1499-1556`)
elenca:
- `ares (interventi COSMINA): interventi_aperti (QUERY: "interventi di X", "che ha fatto X")`
- `chronos (agende/scadenze/campagne): agenda_giornaliera (param: tecnico, data)`

L'aggettivo "agende" su chronos confonde Groq: il modello pensa
"appuntamenti" ≈ "agenda" ≈ chronos. Ma per ACG, la **bacheca COSMINA**
contiene gli appuntamenti reali in formato card; chronos serve per
scadenze normative (CURIT/F-Gas) e campagne batch (walkby/spegnimento)
— **NON per il calendario lavoro**.

### Proposta Fix B — Chiarire system prompt

```diff
- chronos (agende/scadenze/campagne): agenda_giornaliera (param: tecnico, data), scadenze_prossime, slot_tecnico, campagne_attive, campagna_status (param: nome)
+ chronos (scadenze normative + campagne batch): scadenze_prossime, slot_tecnico, campagne_attive, campagna_status (param: nome).
+   NB: agenda_giornaliera è DEPRECATA/non usare. Per "appuntamenti/agenda/lavoro di tecnico X" → ares/interventi_aperti.

- ares (interventi COSMINA): interventi_aperti (QUERY: "interventi di X", "che ha fatto X"), crea_intervento (CREAZIONE: "metti/programma/fissa intervento")
+ ares (interventi COSMINA — bacheca lavoro reale): interventi_aperti (QUERY: "interventi/appuntamenti/agenda/lavori/impegni/giri/uscite di X", "che ha fatto X", "agenda di Y oggi/domani"), crea_intervento (CREAZIONE: "metti/programma/fissa intervento")
```

E nelle REGOLE aggiungere:
```
- "appuntamenti / agenda / lavori / impegni / uscite / giri di X" → ares/interventi_aperti (NON chronos!)
- chronos/agenda_giornaliera è DEPRECATO.
```

### Effort: **S** (10 min)

---

## Bug C — `handleChronosAgendaGiornaliera` filtra troppo restrittivo

### Causa

`projects/iris/functions/handlers/chronos.js:621-623`:

```js
snap = await getCosminaDb().collection("bacheca_cards")
  .where("listName", "==", "INTERVENTI").where("inBacheca", "==", true)
  .limit(300).get();
```

**Tre problemi rispetto a `handleAresInterventiAperti`**:

1. **`listName == "INTERVENTI"` esatto**: scarta `INTERVENTI DA ESEGUIRE`,
   `ACCENSIONE/SPEGNIMENTO`, `LETTURE RIP`, `DA VALIDARE`, ecc. ARES usa
   `_isListInterventi` (substring match `INTERVENT`).
   Conseguenza: lo "spegnimento al CONDOMINIO TURATI 9" di David
   (listName probabile `SPEGNIMENTO` o simile) viene escluso.

2. **`inBacheca == true`**: ARES non applica questo filtro Firestore
   (che richiede indice composito), lo applica solo "in memoria se non
   è una richiesta storica" (vedi `ares.js:255-257`). Card `inBacheca=false`
   non vengono mostrate da chronos ma sì da ares.

3. **`limit(300)`**: ARES usa 500 per `byTecnico` e 800 per `byListName`.
   Limite più stretto su un dataset grande.

### Conseguenza nella sessione

Per la query "che appuntamenti ha david oggi?" routata a chronos:
1. Query `where listName==INTERVENTI && inBacheca==true` → restituisce
   sottoinsieme delle card del giorno
2. SAN GIOVANNI 5 (intervento aperto) potrebbe essere lì se listName
   esatto è "INTERVENTI" e inBacheca=true, ma lo spegnimento TURATI 9 NO
3. Filtro tecnico in memoria scarta tutto ciò che non matcha "david" →
   probabilmente 0 risultati per concomitanza dei filtri

### File coinvolti

- `projects/iris/functions/handlers/chronos.js:619-630` — query Firestore
  troppo restrittiva
- `projects/iris/functions/handlers/chronos.js:632-700` — render

### Proposta Fix C — Allineare chronos a ares

**Opzione 1 (drastica)**: deprecare `handleChronosAgendaGiornaliera` e
indirizzare lo schema NEXUS ad usare `ares/interventi_aperti` per
"agenda di X". Combinato con Fix B, questo è coerente.

**Opzione 2 (minimal)**: replicare la logica di `_isListInterventi` di
ARES in chronos:

```js
// chronos.js:621 (modifica)
// Query allargata: tutte le card con listName che contiene "INTERVENT"
// + ACCENSIONE/SPEGNIMENTO. Filtro in memoria poi.
snap = await getCosminaDb().collection("bacheca_cards")
  .where("techName", "==", tecnico.toUpperCase())
  .limit(500).get();
// Senza filtro listName/inBacheca lato Firestore: applica filtro in memoria.
```

E nel filtro in memoria:
```js
const ln = String(row.listName || "").toUpperCase();
if (!/INTERVENT|ACCENSIONE|SPEGNIMENTO|LETTUR|DA\s+VALIDA|SCADENZ/.test(ln)) continue;
```

Effetto: chronos vedrà gli stessi 4 record di ares per David oggi.

### Rischi Fix C Opzione 2

- Se chronos era usato per UI specifica che si aspetta solo
  `INTERVENTI` esatto, allargarlo cambia l'output. Da verificare nei
  consumatori (PWA o altre Cloud Functions che chiamano questo handler
  via lavagna).
- Bug aggiuntivo: ricerca per `techName == "DAVID"` esatto perde le
  card dove David è in `techNames[]` o `labels[]` (i co-tecnici).
  ARES gestisce questo con 6+1 query parallele (riga 267-306). Se Fix C
  non lo replica, certe card di David non saranno trovate da chronos
  pure post-fix.

### Raccomandazione

**Opzione 1** (deprecare chronos/agenda_giornaliera) è la fix migliore
strategica: niente duplicazione di logica, una sola fonte di verità
(ARES). Fix A + B implicitamente lo realizzano (regex L1 e Groq routano
sempre ad ARES per "agenda/appuntamenti").

### Effort

- Opzione 1 (deprecare): **S** (5 min — già coperto da Fix A+B)
- Opzione 2 (allineare): **M** (45 min — replicare logica techName +
  techNames + labels in chronos)

---

## Riepilogo proposta

| Fix | Severity | Effort | Priorità |
|---|---|---|---|
| A — Regex L1 sinonimi (appuntamenti/agenda/lavoro/impegni) | Alta | S | 1 |
| B — System prompt Groq: "agenda di X" → ares non chronos | Alta | S | 2 |
| C — Deprecare `handleChronosAgendaGiornaliera` (Opzione 1) | Media | S | 3 |

**Ordine consigliato**: A + B + C-Opz1 in un solo commit (~30 min).

Effetto post-fix: "che appuntamenti ha david oggi?" e "agenda di David
oggi" → entrambi regex L1 → `ares/interventi_aperti` → 4 card di David
trovate (1 aperto + 3 eseguiti, mostrabili con/senza `anche chiusi`).

## Test plan

```bash
TS=$(date +%s)
SID="forge-test-appt-${TS}"

# Sinonimi che oggi falliscono → devono passare a regex L1
curl ... -d "{\"sessionId\":\"${SID}-1\",\"message\":\"che appuntamenti ha david oggi?\"}"
# Atteso: source=regex, ares/interventi_aperti, 1 aperto

curl ... -d "{\"sessionId\":\"${SID}-2\",\"message\":\"che agenda ha marco domani?\"}"
# Atteso: source=regex, ares/interventi_aperti

curl ... -d "{\"sessionId\":\"${SID}-3\",\"message\":\"impegni di Federico oggi\"}"
# Atteso: source=regex, ares/interventi_aperti

curl ... -d "{\"sessionId\":\"${SID}-4\",\"message\":\"giro di Lorenzo lunedì\"}"
# Atteso: source=regex, ares/interventi_aperti

# Regression: comandi creazione devono ancora andare a crea_intervento
curl ... -d "{\"sessionId\":\"${SID}-5\",\"message\":\"metti appuntamento a Marco domani al Kristal\"}"
# Atteso: ares/crea_intervento (isCreaInterventoCommand prevale)
```

## File da modificare

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 530-552 | Regex L1 con sinonimi appuntamenti/agenda/lavoro/impegni/giri |
| `projects/iris/functions/handlers/nexus.js` | 1499-1556 | System prompt Groq: chronos NO agenda, ares SI agenda di X |
| `projects/iris/functions/handlers/ares.js` | `isCreaInterventoCommand` | Estendere a "metti/programma APPUNTAMENTO" oltre "intervento" |
| `projects/iris/functions/handlers/nexus.js` | 638-642 | DEPRECATE DIRECT_HANDLER `handleChronosAgendaGiornaliera` (opzionale, già coperto da Fix A) |

## Stato

Bug A+B+C **NON ancora risolti**. La sessione di Alberto ha fatto la
domanda con sinonimo non coperto → Groq routa a chronos sbagliato →
chronos filtra male. Fix in 3 step coordinati, effort totale ~30 min.

## Pattern operativo confermato

Stessa storia di altre dev-request della giornata: **regex L1 troppo
strette → fallback LLM → routing semanticamente plausibile ma errato
dal punto di vista dominio**. La fix definitiva è progressivamente
allargare i regex L1 con i sinonimi italiani naturali (appuntamento,
agenda, lavoro, impegni, giri, uscite) per ridurre la dipendenza da
Groq sui pattern frequenti.
