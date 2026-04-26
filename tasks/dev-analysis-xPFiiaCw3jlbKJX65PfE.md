# Analisi dev-request xPFiiaCw3jlbKJX65PfE

**Origine:** segnalazione "bug_from_chat" dal bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_7m0rtmr6mog6aabk
**Data:** 2026-04-26 19:41 UTC
**Nota di Alberto:** "secondo me la chat non capisce nulla"

## Conversazione segnalata (2 turni utente)

| # | ruolo | contenuto |
|---|---|---|
| 1 | ALBERTO | "che interventi aveva Federico giovedì 23/04/2026" |
| 2 | NEXUS | "Federico il 23/04/2026 ha avuto un intervento: DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA, stato chiuso (co-assegnato a DAVID)." ✓ |
| 3 | ALBERTO | "ok, ci deve andare anche domani mattina con david, **mettigli intervento**" |
| 4 | NEXUS | "David domani non ha interventi (cercato: 253 card totali, filtro data domani, solo aperti)." ✗ |

Il turno 1-2 funziona (fix recente). Il turno 3-4 fallisce: NEXUS interpreta "mettigli intervento" come **una query** (ricerca interventi di David per domani) invece che come **un comando di creazione** (apri un nuovo intervento per David+Federico al condominio di Via Toscanini, programmato per domani mattina).

## Diagnosi — perché "mettigli intervento" non viene riconosciuto come comando

### Bug 1 — il verbo "mettere" non è tra i trigger di apri_intervento
`projects/iris/functions/handlers/nexus.js:443-447`:
```js
{ match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    return (col === "ares" && /(apri_intervent|crea_intervent|nuovo_intervent|open_intervent)/.test(az))
      || /^\s*(apri|crea|nuovo|aggiungi)\s+(un\s+)?intervent/.test(m);
  }, fn: handleAresApriIntervento },
```

La regex regex-side accetta solo `apri|crea|nuovo|aggiungi` come verbi a inizio frase. Verbi italiani equivalenti **NON inclusi**: `metti, programma, fissa, segna, registra, prenota, schedula, pianifica, organizza, prepara`. Tutti naturali nell'italiano colloquiale di Alberto. La frase di Alberto inizia con "ok, ci deve" (non con "metti" all'inizio); il "mettigli intervento" sta dentro la frase, non a inizio.

### Bug 2 — system prompt Haiku non istruisce su "mettigli/programma intervento"
`nexus.js:105-119` documenta `interventi_aperti` (lista) ed `apri_intervento` (creazione) ma:
- Non fornisce esempi di trigger naturali per `apri_intervento` ("metti intervento", "programma intervento", "fissa appuntamento", "segna intervento per domani").
- Non spiega che **tense imperativo + "intervento"** = comando di creazione, non query.
- Non documenta i parametri richiesti per `apri_intervento` (condominio, tecnici[], data/ora, tipo).

Risultato: Haiku ha visto "intervento" + "domani" + nome tecnico (David) e ha classificato come `interventi_aperti` (la query ARES che ha visto già nei messaggi precedenti).

### Bug 3 — handleAresApriIntervento non legge tecnici né data
`projects/iris/functions/handlers/ares.js:505-612` (l'intero handler):
- Estrae solo `condominio`, `note`, `tipo`, `urgenza`.
- **Non estrae `tecnici` né `data`** dai parametri o dal messaggio.
- Quando scrive su `bacheca_cards` (riga 571-585): scrive `name, boardName, desc, workDescription, listName, inBacheca, archiviato, stato, labels, source, created_at, updated_at` ma **NON `techName, techNames, due`**.
- Risultato: anche se fosse stato chiamato, l'intervento creato sarebbe orfano (no tecnico, no data programmata) → la prossima query "interventi di David domani" non lo troverebbe comunque.

### Bug 4 — nessun trasporto di contesto: "ci" e "anche" perdono significato
"**ci** deve andare **anche** domani mattina con david" contiene riferimenti contestuali:
- "ci" = al condominio di Via Toscanini Alessandria (turno 1-2)
- "anche" = oltre al precedente (Federico)
- "con david" = secondo tecnico

Senza riportare al sistema lo `lastQueryParams` (vedi `dev-analysis-0YdtBOK9hBqJvYpkrWDd.md` per la stessa carenza), Haiku può solo guardare i `messages[]` testuali precedenti, che non sono strutturati. Spesso non riesce a ricostruire i parametri.

### Bug 5 — la risposta finale è "David domani non ha interventi"
Anche se interpretato come query, sarebbe più corretto rispondere "David domani non ha **ancora** interventi programmati" (presente, non passato). E soprattutto: il messaggio di Alberto era un **comando**, non una richiesta. Mancare un comando di creazione e rispondere con una query vuota è fuorviante: Alberto pensa "non ha funzionato".

### Bug 6 — manca conferma esplicita prima di scrivere su COSMINA
Anche se il sistema **avesse** capito "mettigli intervento", il flusso ideale è:
1. NEXUS: "Vuoi che apra un intervento al Condominio Via Toscanini Alessandria, programmato domani mattina, assegnato a Federico e David? Conferma o cambia."
2. Alberto: "sì"
3. NEXUS: scrive `bacheca_cards` e conferma con ID.

Oggi `handleAresApriIntervento` scriverebbe direttamente (con DRY_RUN come safety net se attivo). Ma in produzione DRY_RUN è OFF probabilmente. Una creazione senza conferma è rischiosa.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 105-119 | system prompt ARES: `apri_intervento` documentato sommariamente, manca parametri tecnici/data |
| `projects/iris/functions/handlers/nexus.js` | 443-447 | DIRECT_HANDLER per `handleAresApriIntervento`: regex limitata a `apri/crea/nuovo/aggiungi` a inizio frase |
| `projects/iris/functions/handlers/ares.js` | 505-612 | `handleAresApriIntervento`: legge condominio/note/tipo/urgenza ma NON tecnici/data/ora |
| `projects/iris/functions/handlers/ares.js` | 571-585 | scrittura su `bacheca_cards`: NON imposta techName/techNames/due |
| `context/memo-firestore-garbymobile.md` | 215-228 | schema bacheca_cards: documenta techName, techNames[], due (per future scritture corrette) |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Estendere la regex DIRECT_HANDLER per verbi naturali (S)
**Dove:** `nexus.js:443-447`.
**Cosa fa:** ampliare l'elenco dei verbi e accettare il pattern anche non a inizio frase:
```js
const VERBI_CREA = /(apri|crea|nuov[oi]|aggiungi|metti|mettigli|metterli|programma|programmagli|fissa|segna|registra|prenota|schedul|pianifica|organizza|prepara)/;
const m = (ctx?.userMessage || "").toLowerCase();
if (col === "ares" && /(apri_intervent|crea_intervent|nuovo_intervent|open_intervent|metti_intervent|programma_intervent)/.test(az)) return true;
// Match anche non a inizio frase: "ok, mettigli intervento" / "puoi crearmi un intervento per..."
if (new RegExp(VERBI_CREA.source + "\\s+(?:un\\s+|gli\\s+|loro\\s+)?intervent", "i").test(m)) return true;
return false;
```

**Perché:** copre tutti i verbi naturali italiani per "creare un intervento". Riduce dipendenza da Haiku per il routing.

### 2) System prompt rinforzato per apri_intervento (S)
**Dove:** `nexus.js:105-119`.
**Cosa fa:** aggiungere blocco esplicito per `apri_intervento`:
```
- ares.apri_intervento: comando di CREAZIONE intervento sulla bacheca.
  Trigger: "apri/crea/metti/programma/fissa/segna intervento", "mettigli intervento",
    "programmagli un intervento", "fissa appuntamento al [Cond]", "intervento per [Cond] domani".
  Parametri:
    condominio: nome condominio o cliente. Cerca nel messaggio dopo
      "presso/per/al/alla/a/da [Condominio]" oppure usa il condominio
      dell'ultima query (lastQueryParams.condominio) se non esplicito.
    tecnici: array di nomi tecnici (es. ["FEDERICO","DAVID"]). Cerca "con [tecnico]",
      "[tecnico] e [tecnico]". Eredita dall'ultima query se "ci/loro/lui" pronominale.
    data: data+ora ("domani mattina", "26/04/2026 09:00", "venerdì 14:00"). Default: oggi 09:00.
    tipo: manutenzione|riparazione|installazione|sopralluogo (se non esplicito → manutenzione).
    urgenza: bassa|media|alta|critica (default media).
    note: descrizione lavoro ("dare il bianco in via X", "verifica caldaia").
  IMPORTANTE: in caso di tense imperativo ("metti", "fissa", "segna", "programma") +
    sostantivo "intervento/appuntamento" → SEMPRE apri_intervento, MAI interventi_aperti.
```

**Perché:** chiarisce per Haiku la distinzione query vs comando, e i parametri completi.

### 3) Estendere handleAresApriIntervento per leggere tecnici + data (M)
**Dove:** `ares.js:505-612`.
**Cosa fa:**

a) **Estrazione tecnici** dal messaggio + parametri:
```js
const tecnici = [];
if (Array.isArray(parametri.tecnici)) for (const t of parametri.tecnici) if (t) tecnici.push(String(t).toUpperCase());
if (parametri.tecnico) tecnici.push(String(parametri.tecnico).toUpperCase());
// Estrai da messaggio: "con David e Marco" / "con Federico"
const conM = msg.match(/\bcon\s+([a-zà-ÿ\s,e]+?)(?:\s*(?:domani|oggi|ieri|alle|al|a\s|in|per|presso|$|,|\.))/i);
if (conM) {
  for (const name of conM[1].split(/\s+e\s+|,\s*/)) {
    const t = name.trim().toUpperCase();
    if (TECNICI_ACG_UPPER.includes(t)) tecnici.push(t);
  }
}
// Eredita da lastQueryParams se "ci/loro/lui" pronominale (richiede infrastruttura step 4)
const tecniciDedup = [...new Set(tecnici)];
```

b) **Parsing data/ora** (riusa il parser esistente in `parseRangeDataInterventi` per la data, aggiungi parsing ora):
```js
let due = null;
if (parametri.data) due = parseRangeDataInterventi(String(parametri.data))?.from;
if (!due) {
  const dataRange = parseRangeDataInterventi(msg);
  if (dataRange) due = dataRange.from;
}
// Ora: "mattina"=09:00, "pomeriggio"=14:00, "sera"=18:00, "alle 10"="10:00", "alle 14:30"
if (due) {
  if (/\bmattin/i.test(msg)) due.setHours(9,0,0,0);
  else if (/\bpomerigg/i.test(msg)) due.setHours(14,0,0,0);
  else if (/\bsera|serale/i.test(msg)) due.setHours(18,0,0,0);
  else {
    const oraM = msg.match(/\balle?\s+(\d{1,2})(?::(\d{2}))?/i);
    if (oraM) due.setHours(Number(oraM[1]), Number(oraM[2]||0), 0, 0);
    else due.setHours(9, 0, 0, 0);
  }
}
```

c) **Scrittura corretta su `bacheca_cards`**:
```js
const cardData = {
  name: cardName,
  boardName: condominio,
  desc: note || undefined,
  workDescription: note || undefined,
  listName: "INTERVENTI",
  inBacheca: true,
  archiviato: false,
  stato: "aperto",
  labels,
  source: "nexus_ares",
  created_at: FieldValue.serverTimestamp(),
  updated_at: FieldValue.serverTimestamp(),
};
if (tecniciDedup.length) {
  cardData.techName = tecniciDedup[0];
  cardData.techNames = tecniciDedup;
}
if (due) cardData.due = due.toISOString(); // string ISO come 96% delle altre card
await ref.set(cardData);
```

d) **Risposta in prosa** (no bullet, no `**bold**`):
```js
const tecLabel = tecniciDedup.length ? `assegnato a ${tecniciDedup.join(" e ")}` : "non assegnato";
const dueLabel = due ? ` per il ${due.toLocaleDateString("it-IT")} alle ${due.toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"})}` : "";
return {
  content: `Ho aperto un intervento al ${condominio}${dueLabel}, ${tecLabel}. Stato aperto, ID ${ref.id}.`,
  data: { id: ref.id, dryRun: dry, due: due?.toISOString(), tecnici: tecniciDedup },
};
```

### 4) Trasporto contesto (`lastQueryParams`) (M, già descritto in `dev-analysis-0YdtBOK9hBqJvYpkrWDd.md`)
Riprendo il punto: per il "ci/anche/loro" pronominale serve passare a Haiku non solo i `messages[]` ma anche lo stato strutturato dell'ultima query (es. `{tecnico: "FEDERICO", citta: "alessandria", condominio: "Via Toscanini Alessandria", cardId: "..."}`).

Senza questo, Haiku non saprà mai che "ci" = quel condominio specifico.

### 5) Conferma prima di scrittura (S, raccomandato)
**Dove:** `ares.js`.
**Cosa fa:** se DRY_RUN OFF e l'intervento sta per essere scritto su `bacheca_cards`, salva prima un pending in `nexo_ares_pending/{sessionId}` con i parametri parsati e ritorna:
```
"Ti riassumo: intervento al Condominio Via Toscanini Alessandria, domani 27/04 alle 09:00, con Federico e David, manutenzione, urgenza media. Confermo? (sì/cambia/annulla)"
```
Quando Alberto dice "sì", un secondo intercept (`tryInterceptAresApriConferma`) legge il pending e scrive davvero. Pattern già usato per i preventivi (`tryInterceptPreventivoSi`).

### 6) Test dev-request "mettigli intervento" (S)
**Dove:** nuovo `projects/iris/test-ares-mettigli.mjs`.
**Casi:**
1. Sequenza turno 1-2 (query OK già fixata) + turno 3 "mettigli intervento" → routing apri_intervento, parametri estratti, pending creato.
2. "sì confermo" → scrittura su `bacheca_cards` con techName, techNames, due popolati.
3. Verifica: query successiva "interventi di David domani" trova la card appena creata.

## Rischi e alternative

### R1 — Estrazione tecnici fragile
"con david" è facile, ma "con david e marco" o "loro due" sono più ambigui. Mitigazione: whitelist 9 tecnici ACG (già definita in `_extractTecnico`). Se "loro/ci/lui" pronominale → eredita da `lastQueryParams.tecnico`.

### R2 — Parsing ora colloquiale
"domani mattina presto" / "alle 9 e mezza" / "verso le 14". Mitigazione: regex semplice (mattina/pomeriggio/sera/alle N) + default sensato. Se Alberto vuole orari più precisi, può specificarli numericamente.

### R3 — Scrittura accidentale su COSMINA
Una scrittura sbagliata pollue la bacheca con interventi spuri che vanno cancellati a mano. Mitigazione: sempre conferma esplicita (step 5) + DRY_RUN configurabile via `cosmina_config/ares_config.dry_run`.

### R4 — Conflitto con interventi_aperti già esistente
"ok, mettigli un intervento" potrebbe ancora attivare il regex di `interventi_aperti` (perché contiene "intervent" + un nome tecnico). Mitigazione: priorità ai DIRECT_HANDLERS — `apri_intervento` viene prima di `interventi_aperti` nella lista (già è prima nel codice). Ma serve una guard più stringente: se il regex `apri_intervento` matcha, **non** valutare `interventi_aperti`.

### R5 — Tecnici sporchi (dato BERBERI ERGEST)
Cita CLAUDE.md: in `cosmina_contatti_interni` c'è un import sporco "BERBERI ERGEST" che è in realtà "LESHI ERGEST". La whitelist tecnici deve includere entrambi i cognomi se vogliamo essere robusti. O semplicemente accettare il primo match per `nome`.

### Alternative scartate

- **A1: lasciare a Haiku tutto il routing.** Haiku oggi sbaglia ("mettigli" → query). Il regex DIRECT_HANDLER deterministico è più robusto.
- **A2: chiedere sempre conferma anche per query.** Degrada UX. Solo per scritture.
- **A3: nuovo collega "DARIO" per pianificazione interventi.** Esiste già CHRONOS che è il candidato naturale per la PIANIFICAZIONE temporale. Però oggi ARES è il responsabile creazione interventi. Mantengo separazione.

## Effort stimato

**Totale: M (medium)** — 3-4 ore.

| Step | Effort |
|---|---|
| 1) regex DIRECT_HANDLER allargata (verbi metti/programma/…) | S — 20' |
| 2) system prompt rinforzato apri_intervento | S — 30' |
| 3a) estrazione tecnici da messaggio + parametri | M — 45' |
| 3b) parsing data + ora colloquiale | M — 45' |
| 3c) scrittura su bacheca_cards con techName/techNames/due | S — 20' |
| 3d) risposta in prosa (no bullet/bold) | S — 15' |
| 4) trasporto contesto lastQueryParams (ricondotto a fix separato) | M — 60' (separato) |
| 5) conferma esplicita pre-scrittura | M — 60' |
| 6) test mettigli intervento | S — 30' |
| Deploy + email + commit | S — 15' |

Senza step 4-5 (che sono già documentati altrove e meritano fix separato): **~3 ore**.

## Test di accettazione

1. **Sequenza completa di Alberto:**
   - T1 "che interventi aveva Federico giovedì 23/04/2026" → ✓ (già fixato)
   - T2 "ok, ci deve andare anche domani mattina con david, mettigli intervento" → routing `apri_intervento`, condominio="Via Toscanini Alessandria" (ereditato), tecnici=["FEDERICO","DAVID"], due=domani 09:00, tipo=manutenzione. NEXUS chiede conferma.
   - T3 "sì" → scrittura su bacheca_cards, conferma con ID.
   - T4 (verifica) "interventi di David domani" → trova l'intervento appena creato.

2. **Comandi alternativi:**
   - "programma intervento al Kristal per venerdì pomeriggio con Marco" → apri_intervento.
   - "fissa appuntamento condominio Sara giovedì 14:00" → apri_intervento.
   - "metti un intervento per domani con federico" → apri_intervento.

3. **No falsi positivi su query:**
   - "che interventi ha David domani?" → NON apri_intervento, è una query.
   - "interventi aperti di Marco" → query.

4. **Validazione minima:**
   - "mettigli intervento" senza condominio identificabile → "Mi serve il condominio. Quale?"
   - DRY_RUN attivo → simula senza scrivere, conferma esplicita.

## Nota operativa per Alberto

La frase "secondo me la chat non capisce nulla" è un'ottima sintesi: tre comandi successivi (query corretta, query con stato/citta, comando di creazione) richiedono **tre infrastrutture diverse**. La prima ora funziona. La seconda (follow-up con eredità contesto) ha un'analisi pendente. La terza (comando di creazione) è quella di questa analisi.

Una volta implementati tutti e tre, NEXUS dovrebbe gestire **conversazioni continue** invece di richieste atomiche.
