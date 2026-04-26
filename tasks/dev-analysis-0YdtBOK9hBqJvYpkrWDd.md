# Analisi dev-request 0YdtBOK9hBqJvYpkrWDd

**Origine:** segnalazione "bug_from_chat" dal bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_r7fhvinsmog3qw93
**Data:** 2026-04-26 18:39 UTC
**Nota di Alberto:** (nessuna)

> Il template del file `tasks/dev-request-…md` non include la conversazione
> reale. Il vero contenuto è stato letto da Firestore
> `nexo_dev_requests/0YdtBOK9hBqJvYpkrWDd` (8 messaggi, 4 turni utente).

## Conversazione segnalata (4 turni)

| # | ruolo | contenuto | stato |
|---|---|---|---|
| 1 | ALBERTO | "federico aveva venerdi un interventi ad alessandria?" | — |
| 2 | NEXUS | "Federico venerdì 24/04/2026 a Alessandria non ha interventi." | completata |
| 3 | ALBERTO | "**sicuro? controlla anche gli interventi chiusi**" | — |
| 4 | NEXUS | "Federico venerdì 24/04/2026 a Alessandria non ha interventi." | completata (identica alla 2) |
| 5 | ALBERTO | "e giovedi scorso?" | — |
| 6 | NEXUS | "Federico giovedì 23/04/2026 a Alessandria non ha interventi." | completata |
| 7 | ALBERTO | "che interventi aveva federico giovedì 23/04/2026?" | — |
| 8 | NEXUS | "Federico giovedì 23/04/2026 non ha interventi." | completata |

## Verifica dei dati reali

Ho controllato `bacheca_cards` su `garbymobile-f89ac` (Federico nei giorni 20-27 aprile):

- **23 aprile**: 0 interventi → la risposta "non ha interventi" è formalmente corretta.
- **24 aprile**: 1 intervento (`card_1776334245413_l8f6w25iq`, stato `aperto`, **boardName vuoto**, `due` 14:00). Quindi su Alessandria zero davvero, ma su tutta la bacheca quel giorno Federico aveva un intervento "anonimo".
- **20-22 aprile**: 16 interventi (tutti chiusi) sparsi tra Voghera, Pontecurone, Bressana, Rivanazzano. **Nessuno ad Alessandria.**

Quindi le risposte non sono _sostanzialmente_ sbagliate, ma il flusso conversazionale ha tre bug evidenti.

## Diagnosi — 3 bug nello stesso flusso

### Bug 1 — il follow-up "controlla anche gli interventi chiusi" viene IGNORATO
Turno 3: Alberto chiede esplicitamente di rifare la stessa query **rimuovendo il filtro stato** (includere chiusi). NEXUS risponde con la **stessa identica frase** del turno 2 ("Federico venerdì 24/04/2026 a Alessandria non ha interventi."). Questo non è impossibile (potrebbe non esserci nessun intervento di Federico del venerdì 24 ad Alessandria neanche tra i chiusi), ma il problema è che **la risposta è identica al carattere** alla precedente. Significa che NEXUS:

1. NON ha ricostruito i parametri della query precedente (tecnico=Federico, data=24/04, città=Alessandria);
2. NON ha applicato il flag "anche chiusi" → l'handler ARES non è stato neanche rieseguito con `stato_richiesto="tutti"`;
3. ha invece **ricopiato la risposta precedente da Haiku** o caduto su un fallback che produce una stringa già vista.

Verificando il codice:
- La frase "sicuro? controlla anche gli interventi chiusi" non matcha nessun DIRECT_HANDLER (manca un nome di tecnico, manca "intervento di X", manca "interventi a [Città]").
- Cade su `callHaikuForIntent` che riceve i 5 messaggi precedenti come `messages[]`. Haiku **dovrebbe** riconnettere ("USO DEL CONTESTO CONVERSAZIONALE" nel system prompt — `nexus.js:190-211`), ma non c'è alcuna istruzione esplicita su come rifare la query con un parametro modificato (anche-chiusi).
- Anche se Haiku capisce, deve emettere `parametri.stato_richiesto="tutti"` E ripetere `parametri.{tecnico,data,citta}` dal contesto. Il system prompt ARES (`nexus.js:105-119`) NON cita questo parametro né dice "se l'utente dice 'anche chiusi' rifai con stato_richiesto=tutti".

Risultato: Haiku ha probabilmente generato una `rispostaUtente` libera (collega="nessuno") che ricalcava la risposta precedente, oppure ha scelto un routing che ha fallito silenziosamente.

### Bug 2 — il filtro città si "appiccica" come stato sticky
Turno 5: "e giovedi scorso?" — Alberto sta solo cambiando la data (giovedì 23/04 invece di venerdì 24/04). NEXUS risponde "Federico giovedì 23/04/2026 **a Alessandria** non ha interventi." → ha **ereditato** la città Alessandria dal contesto precedente, anche se Alberto NON la cita.

Il comportamento è pericoloso: Alberto potrebbe credere che NEXUS abbia controllato tutta la bacheca mentre invece sta filtrando per Alessandria implicitamente.

Codice:
- `parseCittaIntervento` (`ares.js`) è puro regex sul `userMessage` corrente → su "e giovedì scorso?" → ritorna `null`.
- Quindi non è l'handler ARES che eredita. È **Haiku** che, leggendo i `messages[]` precedenti, vede "Alessandria" e lo passa come `parametri.citta="alessandria"` a sua iniziativa.
- Il prompt ARES (`nexus.js:115-117`) dice: "parametri.citta: nome città citato dall'utente. Lascia vuoto se non c'è." → ambiguo: in un follow-up "se non c'è" si applica al messaggio o all'intera conversazione?

Il sistema attuale è inconsistente:
- "e giovedì scorso?" → eredita città Alessandria ✓ (eredita)
- "controlla anche chiusi" → ignora completamente la query precedente ✗ (NON eredita)

Non c'è una regola dichiarata su cosa ereditare e cosa no.

### Bug 3 — il filtro città continua ad applicarsi anche quando Alberto chiede "tutti"
Turno 7: "che interventi aveva federico giovedì 23/04/2026?" — qui Alberto è esplicito sulla data (23/04/2026) e **non cita Alessandria**. Vuole tutti gli interventi di quel giorno. NEXUS risponde "Federico giovedì 23/04/2026 non ha interventi" — questa volta SENZA "a Alessandria" nella label. Bene, ma:
- è solo un caso fortunato che il 23 ce ne sia 0 davvero;
- se il 23 ce ne fosse stato uno a Voghera, il sistema avrebbe potuto applicare città=Alessandria sticky (Bug 2) e dire "non ha interventi" mentendo.

In questo turno Haiku ha probabilmente "dimenticato" il filtro città perché Alberto ha chiesto in modo molto esplicito "che interventi aveva… giovedì 23/04/2026?" (frase auto-contenuta, senza riferimento al messaggio precedente). Però è instabile: dipende da quando Haiku decide di ereditare e quando no.

## Bug minore — l'handler include includeTerminali male per `tense=="past"`
La mia implementazione recente (`ares.js:_tense`) decide `includeTerminali = tense === "past"`. Per "che interventi aveva federico giovedì 23/04/2026?", "aveva" → past → include terminali. OK.
Per "controlla anche gli interventi chiusi", c'è "anche chiusi" → include terminali via il regex `/anche\s+chius/`. OK.
Però **se il messaggio non arriva al direct handler** (perché manca tecnico/città/data), il flag non serve a nulla.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 105-119 | system prompt ARES: documenta `parametri.{tecnico,data,citta}`. Manca `stato_richiesto` come parametro esplicito. |
| `projects/iris/functions/handlers/nexus.js` | 190-211 | sezione "USO DEL CONTESTO CONVERSAZIONALE": istruisce Haiku ma non ha esempi specifici per follow-up con modifica di un parametro ("anche chiusi", "no aspetta", "togli il filtro X") |
| `projects/iris/functions/handlers/nexus.js` | 443-462 | DIRECT_HANDLER ARES: regex su tecnico/città/intervento+oggi. Non scatta su frasi di follow-up senza tecnico esplicito. |
| `projects/iris/functions/handlers/ares.js` | 1-220 | `handleAresInterventiAperti`: filtri tecnico/data/città su `userMessage` corrente, **nessuna nozione del contesto conversazionale**. |
| `projects/iris/functions/handlers/nexus.js` | 999-1032 | `loadConversationContext`: passa solo `role`+`content`, non i parametri della query precedente. |
| `projects/iris/functions/index.js` | 503-534 | nexusRouter: invoca Haiku con `messages[]` poi `tryDirectAnswer`. Nessun "context state" persistente per query in serie. |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Persistenza dei parametri di query (S-M)
**Dove:** `nexus.js` (writeNexusMessage) + handler ARES.
**Cosa fa:** quando un handler matcha (es. ARES interventi_aperti) e produce un `data` con `{tecnico, range, citta, stato_richiesto}`, salvarlo nel doc `nexus_chat` come campo `lastQueryParams`. Esempio:
```js
await writeNexusMessage(sessionId, {
  role: "assistant",
  content: "...",
  collegaCoinvolto: "ares",
  azione: "interventi_aperti",
  lastQueryParams: { tecnico: "federico", range: "venerdì 24/04/2026", citta: "alessandria", stato_richiesto: "aperti" }
});
```
Poi `loadConversationContext` espone questo `lastQueryParams` al prompt Haiku come stringa esplicita: "L'ultima query a un Collega è stata: ARES interventi_aperti(tecnico=federico, data=venerdì 24/04/2026, citta=alessandria, stato_richiesto=aperti)."

**Perché:** Haiku oggi vede solo il TESTO dei messaggi precedenti, deve ricostruire i parametri ad-hoc. Se gli diamo lo stato strutturato dell'ultima query, il follow-up ("anche chiusi") può modificare un singolo campo e ripetere la chiamata.

### 2) Estensione system prompt ARES con regola di follow-up esplicita (S)
**Dove:** `nexus.js:105-119` (sezione ARES).
**Cosa fa:** aggiungere:
```
parametri.stato_richiesto: "aperti" (default) | "tutti" | "chiusi"
  Trigger "anche chiusi" / "tutti" / "completati" / "chiusi inclusi"
  → stato_richiesto="tutti".

REGOLA FOLLOW-UP: se nei messaggi precedenti l'ultima query ARES era
interventi_aperti(tecnico=X, data=Y, citta=Z, stato_richiesto=W), e
l'utente scrive un messaggio di MODIFICA tipo:
- "anche chiusi" / "anche completati" → ripeti la stessa query con stato_richiesto="tutti"
- "e giovedì?" / "e domani?" → ripeti la stessa query cambiando solo data
- "togli alessandria" / "non solo lì" → ripeti la stessa query con citta=null
- "anche marco" → ripeti la stessa query con tecnico=marco
SEMPRE ripeti TUTTI gli altri parametri dal contesto, NON solo quello citato.
```

**Perché:** rende il modello deterministico nei follow-up. Oggi Haiku è ambiguo: a volte eredita la città, a volte no.

### 3) Handler ARES legge stato_richiesto dai parametri (S)
**Dove:** `ares.js:handleAresInterventiAperti`.
**Cosa fa:** oggi `includeTerminali = tense === "past" || /anche\s+chius/`. Aggiungere come priorità:
```js
const statoRichiesto = String(parametri.stato_richiesto || "").toLowerCase();
let includeTerminali;
if (statoRichiesto === "tutti" || statoRichiesto === "chiusi") includeTerminali = true;
else if (statoRichiesto === "aperti") includeTerminali = false;
else includeTerminali = tense === "past" || /\btutt[ie]\b|\banche\s+chius/.test(userMessageLower);
```
E nel rendering/etichetta: "Federico venerdì a Alessandria ha avuto X interventi (1 chiuso, 2 aperti)."

**Perché:** chiarezza per l'utente sul filtro applicato. Oggi la risposta "non ha interventi" è ambigua: significa "tra gli aperti" o "in totale"?

### 4) Diagnostica nella risposta vuota (S)
**Dove:** `ares.js`, blocco "no top".
**Cosa fa:** se 0 risultati, dichiarare ESPLICITAMENTE i filtri applicati:
> "Federico venerdì 24/04/2026 a Alessandria non ha interventi (cercato anche tra i chiusi)."
> oppure: "Federico venerdì 24/04/2026 a Alessandria non ha interventi tra quelli aperti. Vuoi che controlli anche chiusi e completati?"

**Perché:** quando Alberto chiede "sicuro? controlla anche chiusi" lo fa perché la risposta è ambigua. Se il sistema dice fin da subito quale filtro stato ha applicato, Alberto non deve insistere.

### 5) Preservazione esplicita dei filtri nella label intro (S)
**Dove:** `ares.js`, costruzione intro per più risultati e header.
**Cosa fa:** sostituire l'intro corrente con un sommario completo dei filtri applicati:
> "Filtro: Federico, venerdì 24/04/2026, città Alessandria, anche chiusi. → Trovo 0 interventi."

Di nuovo, riduce ambiguità.

### 6) Eliminazione "Haiku copia parametri di sua iniziativa" (S)
**Dove:** prompt Haiku (`nexus.js:105-119`).
**Cosa fa:** dichiarare esplicitamente: "I parametri ARES sono SEMPRE solo quelli dichiarati nel messaggio CORRENTE dell'utente, fatta eccezione per le REGOLE FOLLOW-UP sopra. Non aggiungere città/data/tecnico solo perché compariva nei messaggi precedenti, a meno che non sia un follow-up esplicito."

**Perché:** elimina il sticky-filter (Bug 2). "e giovedì scorso?" è un follow-up — ok ereditare tecnico+città+stato. Ma "e federico domani?" è una **nuova query** (cambiano 2 parametri) — l'inheritance va riconsiderata.

### 7) Logging del routing per debug (S)
**Dove:** `nexus.js:tryDirectAnswer` o subito dopo.
**Cosa fa:** scrivere nel doc `nexus_chat` (campo `direct.handlerName` + `direct.parametri`) il nome del handler che è stato invocato e con quali parametri. Oggi il messaggio NEXUS contiene `intent` ma non sempre il dettaglio.

**Perché:** quando il bug accade è diabolicamente difficile capire quale handler ha risposto e con quali parametri. Avere questa info in nexus_chat permette debug rapido.

### 8) Test unitari sul flusso conversazionale (M)
**Dove:** nuovo file `projects/iris/test-conversational-followup.mjs`.
**Casi da coprire:**
1. Q1 "Federico venerdì ad Alessandria?" → ARES con tecnico+data+città.
2. Q2 "anche chiusi" → ARES con stessi parametri + stato_richiesto=tutti.
3. Q3 "e giovedì?" → ARES con data=giovedì, stesso tecnico, stessa città, stesso stato_richiesto.
4. Q4 "che interventi aveva federico giovedì 23/04?" → ARES senza città, tecnico+data espliciti.
5. Q5 (non in questa conversazione ma critico) "no aspetta, intendevo Voghera" → ARES con città=voghera (override).

## Rischi e alternative

### R1 — Haiku non rispetta sempre le regole follow-up
Anche col system prompt rinforzato, Haiku può ignorare le regole. Mitigazione: aggiungere unit test FORGE che simulano le 5 sequenze sopra e verificano `azione=interventi_aperti` + `parametri.{tecnico,data,citta,stato_richiesto}` corretti. Se i test falliscono, iterare prompt.

### R2 — `lastQueryParams` può crescere sproporzionatamente
Ogni `nexus_chat` doc avrà un campo extra. Costo Firestore trascurabile (∼200 byte). Rischio: se l'handler ritorna `data` strutturato grosso (es. lista interventi), salvarlo tutto sarebbe un eccesso. Salvo solo i `parametri` rilevanti per il follow-up (~5-10 campi).

### R3 — Sticky-filter "by design"
In altri scenari (CHARTA "report mensile aprile" → "anche maggio"), l'inheritance è desiderato. Il fix non deve eliminarla del tutto, deve renderla **dichiarata e modificabile**. Quindi: il sticky è OK, ma deve essere ovvio nella risposta ("Filtro: maggio. Aggiunto al precedente aprile") e annullabile ("solo maggio" → reset).

### R4 — Casi misti tra "follow-up" e "nuova query"
"che interventi ha Marco oggi?" dopo una query su Federico è ambiguo: nuovo tecnico = nuova query, o follow-up con override tecnico? Mitigazione: se cambia ≥2 parametri rispetto al lastQueryParams, considera "nuova query" (no inheritance). Se cambia 0-1 parametri, considera "follow-up" (inheritance dei rimanenti).

### Alternative scartate

- **A1: passare a Haiku TUTTO lo stato (inclusi tutti i risultati)**: troppo verboso, costoso. Bocciato.
- **A2: rifiutare i follow-up impliciti, chiedere sempre conferma**: degrada UX. Bocciato.
- **A3: refactor per usare un agente "stateful" tipo LangGraph**: troppo grosso per il problema. Bocciato.

## Effort stimato

**Totale: M (medium)** — 3-4 ore.

| Step | Effort |
|---|---|
| 1) `lastQueryParams` su nexus_chat (writer + reader) | M — 60' |
| 2) prompt ARES con regola follow-up esplicita | S — 30' |
| 3) handler ARES legge `stato_richiesto` | S — 20' |
| 4) diagnostica nella risposta vuota (filtri dichiarati) | S — 20' |
| 5) intro discorsiva con filtri | S — 15' |
| 6) regola "no copy implicito" per Haiku | S — 15' |
| 7) logging direct.handlerName/parametri | S — 20' |
| 8) test conversational-followup.mjs (5 sequenze) | M — 60' |
| Deploy + email + commit | S — 15' |

## Test di accettazione

1. **Sequenza completa di Alberto** (turn 1→4):
   - T1 "federico aveva venerdi un interventi ad alessandria?" → "Federico venerdì 24/04 a Alessandria non ha interventi tra quelli aperti."
   - T2 "controlla anche chiusi" → "Ho cercato anche tra i chiusi: Federico venerdì 24/04 a Alessandria non ha interventi (cercato in 0 aperti + 0 chiusi)."
   - T3 "e giovedì scorso?" → "Federico giovedì 23/04 a Alessandria non ha interventi (cercato anche tra i chiusi, ereditando il filtro città)."
   - T4 "che interventi aveva federico giovedì 23/04/2026?" → senza filtro città: "Federico giovedì 23/04 non ha interventi (cercato in tutta la bacheca)."

2. **Filtro non sticky se lo togli esplicitamente**: dopo T2, "togli alessandria, controlla in tutta italia" → ARES con citta=null.

3. **Sticky chiaro**: l'intro mostra sempre quali filtri sono stati applicati ed eventualmente da quale messaggio sono ereditati.

4. **Persistenza nexus_chat**: verifico che ogni doc assistant ARES abbia `lastQueryParams` valorizzato.
