# Dev Analysis — oHNM7rT3oXHHFpkY28CI

Data analisi: 2026-04-29
Source: `tasks/dev-request-oHNM7rT3oXHHFpkY28CI.md` (bug_from_chat, sessione `nx_u1ytb30mmok15r3l`)

## 1. Sintesi

Nella conversazione NEXUS sono presenti **due bug distinti**, indipendenti
ma entrambi riconducibili al routing intent + uso del contesto multi-turno.
Il bug richiamato esplicitamente dal bottone 🐛 è probabilmente l'ultimo
("ho delle mail da edoardo?"), ma il primo ("e nei prossimi giorni?") è
altrettanto regressivo e va trattato insieme.

| ID | Domanda Alberto | Risposta NEXUS | Cosa doveva succedere |
|----|-----------------|---------------|------------------------|
| A  | "e nei prossimi giorni?" (dopo "che interventi ha oggi marco?") | "Tutti non ha interventi pianificati per mercoledì 29 aprile." | Lista interventi di **Marco** dei prossimi N giorni (es. fino a domenica) |
| B  | "ho delle mail da edoardo?" | "Quale email vuoi che legga? Dimmi un numero (1-5) o il mittente..." | Conteggio/lista email da mittenti che contengono "edoardo" (o "non trovo email da edoardo") |

---

## 2. Bug A — "e nei prossimi giorni?"

### 2.1 Diagnosi

Il messaggio è una follow-up al turno precedente (interventi di Marco
oggi). Il routing LLM (Groq llama-3.3-70b, fallback Ollama
qwen2.5:7b) ha prodotto qualcosa tipo:

```json
{
  "collega": "chronos",
  "azione": "agenda_giornaliera",
  "parametri": { "tecnico": "tutti", "data": "" }
}
```

Tre problemi a cascata:

1. **Tecnico perso** dal contesto. Il messaggio "e nei prossimi giorni?"
   non nomina Marco; il LLM doveva riprendere `tecnico=Marco` dai
   `messages[]` precedenti. Il system prompt
   (`projects/iris/functions/handlers/nexus.js:216-237`) lo richiede
   esplicitamente ("USO DEL CONTESTO CONVERSAZIONALE — FONDAMENTALE"),
   ma il modello ha invece passato `tecnico:"tutti"` (un fallback
   inventato — non c'è "tutti" né nel messaggio né nel turno
   precedente).

2. **Wrong collega**. La domanda "interventi nei prossimi giorni" è
   una QUERY su bacheca COSMINA → `ares/interventi_aperti` con
   `parametri.data="prossimi giorni"` o equivalente. Il LLM è andato su
   `chronos/agenda_giornaliera`, che è pensato per **un giorno solo**
   (oggi/domani/dopodomani — vedi `chronos.js:587-593`), non per range.

3. **Handler non parsa "prossimi giorni"**.
   `handleChronosAgendaGiornaliera` (`chronos.js:576-668`) supporta
   solo `oggi`, `domani`, `dopodomani` da regex sul user message; per
   tutto il resto ricade su `new Date()` (oggi). Quindi ha calcolato
   il 29 aprile. Inoltre **non valida** che `tecnico` sia un nome
   reale: accetta letteralmente la stringa `"tutti"` e la usa per
   filtrare → `tec.toLowerCase().includes("tutti")` = sempre falso → 0
   interventi → output `Tutti non ha interventi pianificati per…`.

### 2.2 File coinvolti

- `projects/iris/functions/handlers/nexus.js`
  - 53-258 `NEXUS_SYSTEM_PROMPT` — manca regola esplicita per
    "prossimi giorni / nei prossimi giorni" + esempio di uso del
    contesto per ereditare il tecnico
  - 1098-1127 `loadConversationContext` — funziona, prende ultimi 5
    scambi
  - 1467-1526 `callIntentRouter` — Groq + fallback Ollama
  - 1528-1580 `buildOllamaSystemPrompt` — versione compatta per
    Ollama; meno dettagliata, vedi note
- `projects/iris/functions/handlers/chronos.js:576-668`
  - `handleChronosAgendaGiornaliera` — singolo giorno, no range,
    accetta `tecnico="tutti"`
- `projects/iris/functions/handlers/ares.js:57-139`
  - `parseRangeDataInterventi` — supporta `oggi/ieri/domani/dopodomani/
    questa-prossima settimana/giorno settimana/data assoluta`. **Manca
    "prossimi giorni" / "nei prossimi giorni" / "settimana" generica.**
  - 226-229+ `handleAresInterventiAperti` — userebbe il range parsato

### 2.3 Proposta

Tre interventi, dal più impattante al più chirurgico:

**P-A1 — Aggiungere parsing "prossimi giorni" in `parseRangeDataInterventi`** (ares.js)

```js
// dopo "settimana_prossima"
if (/\b(?:nei\s+)?prossim[ie]\s+giorn[io]\b|\bnei\s+(?:prossimi\s+)?giorn[io]\b/.test(m)) {
  // finestra a 7 giorni a partire da domani (escluso oggi, già coperto)
  return { from: _addDays(today, 1), to: _addDays(today, 8), label: "i prossimi giorni" };
}
```

Effetto: "interventi di Marco nei prossimi giorni" e "e nei prossimi
giorni?" (se il LLM eredita il tecnico) finiscono su
`ares/interventi_aperti` con range corretto.

**P-A2 — Hardening Haiku/Groq sul contesto: tecnico ereditato**

Aggiungere un esempio esplicito nel system prompt, sezione "USO DEL
CONTESTO CONVERSAZIONALE":

```text
ESEMPIO eredità di parametro tecnico:
- Alberto: "che interventi ha oggi marco?"
- (NEXUS risponde: lista interventi di Marco)
- Alberto: "e nei prossimi giorni?"
  → ares/interventi_aperti, parametri: {tecnico:"Marco", data:"prossimi giorni"}
  NON inventare tecnico:"tutti". Se il messaggio è generico SENZA cambio
  di soggetto, il tecnico resta quello del turno precedente.
```

Stessa cosa nel prompt compatto Ollama (`buildOllamaSystemPrompt`,
nexus.js:1531+).

**P-A3 — Reject `tecnico="tutti"` lato handler**

In `handleChronosAgendaGiornaliera` (chronos.js:598) e in
`handleAresInterventiAperti`, se `tecnico` è uno di
`["tutti", "ognuno", "tutto", "nessuno", ""]` → trattalo come "no
tecnico filtro" (non come stringa di filtro). Evita la regressione di
"Tutti non ha interventi…".

```js
const RESERVED_NON_TECNICI = new Set(["tutti","ognuno","tutto","nessuno","everyone","all"]);
if (RESERVED_NON_TECNICI.has(tecnico.toLowerCase())) tecnico = "";
```

Inoltre, `handleChronosAgendaGiornaliera` dovrebbe estendere il
parsing date:
- se il messaggio contiene "prossim[i]e giorn[oi]" / "settimana" /
  "questa settimana" → restituire un messaggio che invita a usare
  `interventi_aperti` o, meglio, **rilanciare** internamente a
  `handleAresInterventiAperti` con range esteso.

### 2.4 Rischi

- **R-A1** Il LLM potrebbe persistere errori se Groq viene re-instradato
  con prompt poco aggiornato (Ollama 7B in fallback è meno reattivo
  agli esempi). Il fix sul prompt va replicato in `buildOllamaSystemPrompt`.
- **R-A2** Whitelist `RESERVED_NON_TECNICI` rischia di intercettare
  un cognome reale. Mitigazione: la whitelist contiene solo termini
  generici, nessun cognome.
- **R-A3** `parseRangeDataInterventi` con range a 7 giorni per
  "prossimi giorni" è arbitrario; alternativa = 5 giorni lavorativi.
  Decisione: 7 è più safe (copre weekend e Alberto vede già il filtro
  in label).

### 2.5 Alternative

- A1) Lasciar perdere chronos e fare in modo che il LLM
  routi sempre `interventi_aperti`. Più pulito ma richiede aggiornare
  prompt e perdere la differenziazione "agenda_giornaliera = un giorno"
  vs "interventi_aperti = range".
- A2) Solo prompt fix (no handler change). Più rischioso: dipende
  totalmente da Groq, niente safety net.
- A3) Solo handler change (no prompt fix). Funziona per "prossimi
  giorni" generico ma non risolve l'eredità del tecnico → "Tutti" si
  ripresenta su altri pattern.

**Raccomandazione**: P-A1 + P-A2 + P-A3 insieme (cintura + bretelle).

---

## 3. Bug B — "ho delle mail da edoardo?"

### 3.1 Diagnosi

Routing LLM ha prodotto qualcosa di simile a:

```json
{
  "collega": "iris",
  "azione": "leggi_email",
  "parametri": { "mittente": "edoardo" }
}
```

oppure azione=`leggi_email` con parametri vuoti. Catturato dal
DIRECT_HANDLER `nexus.js:397-403` che mappa
`(col === "iris" && /leggi_email/.test(az))` → `handleLeggiEmail`.

`handleLeggiEmail` (`iris.js:158-249`) cerca un indice numerico (1ª,
2ª…) o un nome via regex `(?:leggi|apri|mostra(?:mi)?|dimmi)…(di|da)
…` (riga 184). La frase "ho delle mail da edoardo?" non contiene
nessuno di quei verbi, quindi `mittenteMatch` = null e si finisce nel
fallback "Quale email vuoi che legga?" (riga 206-209).

L'azione corretta era `ricerca_email_mittente`, gestita da
`handleRicercaEmailMittente` (`iris.js:262-280`) che già fa la cosa
giusta:
- accetta `parametri.mittente` come query
- filtra le ultime 400 email su `sender|senderName`
- risponde "Non trovo email da edoardo nelle ultime 400" o lista
  conversazionale.

### 3.2 File coinvolti

- `projects/iris/functions/handlers/nexus.js`
  - 53-258 `NEXUS_SYSTEM_PROMPT` — sezione iris menziona
    `ricerca_email_mittente` ma non ha esempi del pattern "ho mail da
    X" / "mi ha scritto X" / "ricevo qualcosa da X"
  - 397-403 DIRECT_HANDLER `handleLeggiEmail` — regex troppo
    permissiva sull'azione (`leggi.*mail`) e troppo restrittiva sul
    messaggio (richiede verbo `leggi/apri/mostra/dimmi`)
- `projects/iris/functions/handlers/iris.js`
  - 158-249 `handleLeggiEmail`
  - 184 regex `mittenteMatch`
  - 197-204 fallback search
  - 262-280 `handleRicercaEmailMittente` (handler giusto)

### 3.3 Proposta

**P-B1 — DIRECT_HANDLER user-message-first per "mail da X"**

Aggiungere PRIMA di `handleLeggiEmail` (nexus.js:397) un nuovo direct
handler che intercetta i pattern di ricerca per mittente:

```js
{
  match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    // "ho (delle) mail/email da X", "mi ha scritto X", "c'è/è arrivata mail da X",
    // "qualcosa da X", "novità da X" (in contesto email)
    if (/\b(?:ho|c'?è|c'?ho|ci\s+sono|mi\s+ha|ricevut\w*|arrivat\w*|novità)\b.{0,20}\b(?:mail|email|messaggi)\b.{0,15}\b(?:da|di|del|della)\s+([a-zà-ÿ][a-zà-ÿ\s'.-]{2,})/i.test(m)) return true;
    if (/\bmail\s+(?:da|di|del|della)\s+[a-zà-ÿ]/i.test(m) && !/(?:leggi|apri|mostra|dimmi)/i.test(m)) return true;
    if (col === "iris" && /(mittente|sender|cerca_email|ricerca|email_da|da_mittente)/.test(az)) return true;
    return false;
  },
  fn: async (parametri, ctx) => {
    // Estrai mittente dal messaggio se non già nei parametri
    const m = (ctx?.userMessage || "").toLowerCase();
    if (!parametri?.mittente && !parametri?.sender && !parametri?.nome) {
      const ext = m.match(/\b(?:da|di|del|della)\s+([a-zà-ÿ][a-zà-ÿ\s'.-]{2,30})/i);
      if (ext) parametri = { ...parametri, mittente: ext[1].trim() };
    }
    return handleRicercaEmailMittente(parametri);
  },
},
```

Va inserito PRIMA dell'handler `handleLeggiEmail` (riga ~397) altrimenti
quest'ultimo lo intercetta.

**P-B2 — Prompt fix, sezione iris**

Aggiungere in `NEXUS_SYSTEM_PROMPT` sezione iris (~riga 92-104):

```text
"ho mail da X?" / "mi ha scritto X?" / "novità da X?" / "ho ricevuto
da X?" → ricerca_email_mittente (parametri.mittente = "X").
NON usare leggi_email per queste domande di ricerca.
```

E specchiare in `buildOllamaSystemPrompt` (nexus.js:1531+).

**P-B3 — Hardening fallback `handleLeggiEmail`**

Quando `handleLeggiEmail` viene comunque invocato senza idx/emailId
ma con `parametri.mittente` non vuoto, **delegare** a
`handleRicercaEmailMittente` invece di rispondere "Quale email vuoi
che legga?". Mantiene retro-compatibilità anche se il prompt fix
sfugge.

```js
// in handleLeggiEmail, dopo le ricerche idx/emailId/regex:
if (!target) {
  const fallbackMittente = parametri.mittente || parametri.sender || parametri.nome;
  if (fallbackMittente) {
    return handleRicercaEmailMittente({ mittente: fallbackMittente });
  }
  return { content: `Quale email vuoi che legga? ...` };
}
```

### 3.4 Rischi

- **R-B1** Il direct handler P-B1 con regex permissiva potrebbe
  intercettare frasi NON-email, es. "ho lavorato da Mario" o "vengo da
  Edoardo". Mitigazione: tutte le condizioni richiedono la parola
  `mail|email|messaggi`. Test: "ho fatto una telefonata da Edoardo"
  → NON matcha (manca `mail`). OK.
- **R-B2** L'estrazione "X" da `(?:da|di) ([a-zà-ÿ]+...)` può catturare
  parole comuni ("da casa", "da Tortona"). Whitelist negativa di stop
  words geo-correlate (`casa, ufficio, oggi, ieri, domani, lavoro,
  fuori, [città note]`) raccomandata. Già esistono pattern simili in
  `ares.js:_extractTecnico` riga 183.
- **R-B3** `handleRicercaEmailMittente` legge **400 email** (riga
  269): se la query è generica (es. "edoardo") può essere lenta. OK
  per prima implementazione.

### 3.5 Alternative

- B1) Solo prompt fix (P-B2). Funziona se Groq è affidabile, ma
  Ollama fallback potrebbe sbagliare. Meno robusto.
- B2) Solo handler delega (P-B3). Risolve il caso specifico ma se il
  LLM passa parametri vuoti rimane il messaggio "Quale email vuoi che
  legga?". Half-fix.
- B3) Solo direct handler regex (P-B1). Salta il LLM completamente
  per il pattern "mail da X" → zero costo, latenza minima. Più
  robusto ma rischio di catturare falsi positivi (vedi R-B1).

**Raccomandazione**: P-B1 + P-B2 + P-B3 insieme (defense in depth).
P-B1 fa il match diretto, P-B2 educa il LLM, P-B3 è la rete di
sicurezza per i casi che sfuggono.

---

## 4. Effort stimato

| Step | Effort | Rischio |
|------|--------|---------|
| P-A1 (parseRangeDataInterventi "prossimi giorni") | **S** | basso |
| P-A2 (prompt: eredità tecnico + esempio) | **S** | basso |
| P-A3 (handler: reject `tutti` come tecnico) | **S** | basso |
| P-B1 (DIRECT_HANDLER "mail da X") | **S** | medio (regex tuning) |
| P-B2 (prompt: ricerca_email_mittente esempi) | **S** | basso |
| P-B3 (delega leggi_email → ricerca_mittente) | **S** | basso |

**Totale stimato: M** (mezza giornata sviluppo + test FORGE su 5-6
varianti per pattern). Tutti i fix sono additive, nessun breaking
change su flussi esistenti.

### Test minimi consigliati (FORGE / `nexusTestInternal`)

1. "che interventi ha oggi marco?" → dovrebbe restare come oggi (lista interventi Marco)
2. "e nei prossimi giorni?" (in stessa sessione) → ARES interventi Marco range +7
3. "interventi di Federico nei prossimi giorni" → ARES interventi Federico range +7
4. "agenda di tutti" → handler dovrebbe rispondere "quale tecnico?" non andare in 0-result
5. "ho delle mail da edoardo?" → ricerca_email_mittente / "non trovo email da edoardo nelle ultime 400"
6. "ho ricevuto qualcosa da Torriglia?" → idem
7. "mi ha scritto Edoardo?" → idem
8. "leggi la mail di Torriglia" (regression test) → resta su handleLeggiEmail
9. "vengo da Edoardo" (negative — niente email) → NON deve scattare il direct handler
10. "ho mail oggi?" (no mittente) → email_oggi (non scattare il nuovo handler)

---

## 5. Note operative

- Nessuna modifica a schema Firestore, rules, IAM, secrets o servizi
  esterni (Hetzner, Railway). Tutto è codice in
  `projects/iris/functions/handlers/`.
- Deploy = `firebase deploy --only functions:nexus` (region
  `europe-west1`).
- Cache busting PWA non necessario (modifiche solo backend).
- Prompt change → impatto su sessioni esistenti istantaneo (non c'è
  cache di prompt lato client).

Niente da implementare ora, come da istruzioni del task.
