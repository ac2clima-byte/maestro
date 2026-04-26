# Analisi dev-request J9tIBTJnMp6GhkQvGi7J

**Origine:** segnalazione "bug_from_chat" dal nuovo bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_q34h35o9mog2kosp
**Data:** 2026-04-26 17:56 UTC

> Nota: il file `tasks/dev-request-…md` è stato materializzato col vecchio template
> (prima del fix maestro `df6f579` che include la conversazione). Il contenuto
> reale è stato letto da Firestore (`nexo_dev_requests/J9tIBTJnMp6GhkQvGi7J`).

## Conversazione segnalata

| ruolo | contenuto |
|---|---|
| ALBERTO | "abbiamo un preventivo datato oggi su doc?" |
| NEXUS | "Non ho visibilità sui documenti Google Drive o sulle cartelle condivise. Controlla direttamente in Drive nella cartella Preventivi, dovrebbe esserci filtrato per data odierna." |

## Diagnosi — cosa succede oggi

1. La frase "abbiamo un preventivo datato oggi su DOC?" significa: "su `acg-doc.web.app` (collection Firestore `docfin_documents`, type=PRV) c'è un preventivo emesso con `dateIssued` = oggi?".
2. **Nessun handler** in `projects/iris/functions/handlers/` legge `docfin_documents`. L'unica menzione di `docfin_documents` nel codice IRIS è in `preventivo.js:1060` e `:1549` come commento ("GRAPH ci scrive"), ma in **lettura** non c'è niente.
3. Il system prompt di Haiku in `nexus.js:55-167` non contiene alcuna azione "preventivi emessi su DOC" / "documenti DOC oggi". Le azioni disponibili per i preventivi sono solo:
   - `orchestrator/preparare_preventivo` → workflow di **creazione**;
   - `calliope/bozze_pendenti` → bozze in `calliope_bozze` con `status==da_approvare` (ovvero **non ancora approvate** né messe su DOC).
4. L'unico handler "lista preventivi" è `handleBozzePendenti` (`preventivo.js:1674`) — match in `nexus.js:290-300` su frasi tipo "bozze pendenti", "preventivi in attesa", "cosa c'è da approvare". La frase di Alberto **non matcha** nessuna di queste regex.
5. Nessun `DIRECT_HANDLERS` in `nexus.js:277-…` matcha la frase ("preventivo … oggi … doc"). Così la richiesta cade su Haiku.
6. Haiku, **non avendo l'azione disponibile**, ritorna un `rispostaUtente` libero (vedi `parseAndValidateIntent` in `nexus.js:240-273` e `fallbackIntent` in `nexus.js:230`). In questo caso ha **allucinato** "Google Drive / cartelle condivise / cartella Preventivi" — concetti che non esistono nel codebase NEXO/ACG (grep `Drive` su `nexus.js` = 0 occorrenze). Su DOC non si usa Drive: i PDF stanno su Firebase Storage `documents/{anno}/{azienda}/preventivi/` e i metadata su `docfin_documents`.

In sintesi: **manca un handler per consultare i preventivi emessi su DOC** e Haiku, lasciato libero, dà risposte sbagliate inventando il backend.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/nexus.js` | 55-167 | system prompt: enumera le azioni disponibili (manca "preventivi emessi" / "documenti DOC") |
| `projects/iris/functions/handlers/nexus.js` | 230-238 | `fallbackIntent` → quando Haiku risponde collega="nessuno" la `rispostaUtente` viene mostrata grezza all'utente |
| `projects/iris/functions/handlers/nexus.js` | 277-… | `DIRECT_HANDLERS` regex-based: nessun match per "preventivo … oggi … doc" |
| `projects/iris/functions/handlers/nexus.js` | 290-305 | match `handleBozzePendenti` / `handleApriBozza` (solo bozze pre-approvazione) |
| `projects/iris/functions/handlers/preventivo.js` | 1674-1740 | `handleBozzePendenti` legge `calliope_bozze`, NON `docfin_documents` |
| `projects/iris/functions/handlers/preventivo.js` | 1745-… | `handleApriBozza` idem |
| `projects/iris/functions/handlers/preventivo.js` | 1176-1280 | `approvaEGeneraPdf` → costruisce `docfinPayload` con `type: "PRV"` e lo invia a GRAPH (`graphApi/api/v1/generate`) che scrive su `docfin_documents` (progetto `garbymobile-f89ac`) |
| `projects/iris/functions/handlers/shared.js` | (export `getCosminaDb`) | accesso cross-project a `garbymobile-f89ac` — già usato da `echo.js`, `ares.js`, `echo-wa-inbox.js`, `echo-digest.js` |
| `acg_suite/COSMINA/firebase/doc-public/js/sections/admin-rtidf.js` | 41-78 | schema `docfin_documents`: campi `type`, `subtype`, `number`, `year`, `dateIssued`, `clientName`, `condominioName`, `description`, `totals.{imponibile,iva,totale}`, `pdfUrl`, `status`, `sourceApp`, `createdAt`, `createdBy`, `tags[]` |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Nuovo handler `handleDocfinPreventiviOggi` (S)
**Dove:** nuovo file `projects/iris/functions/handlers/docfin.js` (o aggiunta a `preventivo.js` come `handlePreventiviEmessi`).
**Cosa fa:** legge `docfin_documents` (via `getCosminaDb()`) filtrando `type == "PRV"` e `dateIssued >= startOfDay && dateIssued < endOfDay`. Conta + lista breve.
**Schema query:**
```js
const cosm = getCosminaDb();
const start = startOfDay(new Date());      // 00:00 today
const end   = new Date(start.getTime() + 86_400_000);
let snap;
try {
  snap = await cosm.collection("docfin_documents")
    .where("type", "==", "PRV")
    .where("dateIssued", ">=", admin.firestore.Timestamp.fromDate(start))
    .where("dateIssued", "<",  admin.firestore.Timestamp.fromDate(end))
    .orderBy("dateIssued", "desc")
    .limit(10)
    .get();
} catch (e) {
  // dateIssued è salvato come string "YYYY-MM-DD" in alcuni record (vedi
  // admin-rtidf.js: dateVal è value di un <input type="date">). Fallback:
  // .where("dateIssued", "==", "2026-04-26") — vedi rischio (R1).
}
```
**Output discorsivo (rispetta la regola NEXUS chat):**
> "Oggi su DOC c'è 1 preventivo emesso: PRE-001/2026 per Condominio La Bussola, 1.220 euro. Ti faccio aprire il PDF?"
> oppure: "Oggi su DOC non risultano preventivi emessi."

### 2) Wiring del DIRECT_HANDLER (S)
**Dove:** `nexus.js` blocco `DIRECT_HANDLERS` (vicino al match `handleBozzePendenti` riga 290).
**Match suggerito (regex sul messaggio user, indipendente da Haiku):**
```js
{ match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    if (col === "calliope" && /(preventivi.*oggi|preventivi.*emess|documenti.*doc|doc.*oggi)/.test(az)) return true;
    return /\b(?:abbiamo|c'?è|ci sono|hai|oggi)\b.*\bpreventiv\w*\b.*\b(?:su\s+doc|in\s+doc|emess|oggi|odierna|odierno)\b/i.test(m)
        || /\bpreventiv\w*\b.*\b(oggi|emess)\b.*\b(doc|emess)?\b/i.test(m)
        || /\bdocumenti\s+(?:di\s+)?(?:oggi|odierni)\s+(?:su\s+)?doc\b/i.test(m);
  }, fn: handleDocfinPreventiviOggi },
```
**Posizionamento:** PRIMA di `handleBozzePendenti` per evitare match parziale ("preventivi … in attesa" potrebbe mischiarsi). Comunque il match di `handleBozzePendenti` è già piuttosto specifico (richiede "in attesa/sospeso/pendent"), quindi non collide.

### 3) Aggiornamento system prompt Haiku (S)
**Dove:** `nexus.js:55-167`, sezione "azioni" del collega `calliope` o nuova voce dedicata `doc`.
Aggiungere riga tipo:
> `- doc/calliope → documenti emessi su DOC: azioni: preventivi_emessi_oggi, preventivo_per_data (parametri: {data}), preventivi_per_cliente (parametri: {cliente})`.
> "abbiamo un preventivo oggi su doc / abbiamo emesso preventivi oggi" → calliope/preventivi_emessi_oggi.

Questo serve anche come **anti-allucinazione**: senza un'azione, Haiku continuerà a inventare backend (Drive, Dropbox, ecc.). Il modello tende a confabulare quando il prompt non ha la risposta.

### 4) Anti-allucinazione difensivo (S, opzionale ma consigliato)
**Dove:** `parseAndValidateIntent` in `nexus.js:240-273` o subito dopo, in `nexusRouter`.
Quando Haiku ritorna `collega="nessuno"` con `azione="chiarimento"` o vuota e `confidenza < 0.5`, **rifiutare la `rispostaUtente` libera** e usare un fallback canonico tipo:
> "Non sono sicuro di cosa controllare. Vuoi i preventivi emessi oggi su DOC, le bozze pendenti, le email di oggi, o altro?"

Questo elimina la classe di bug "Haiku inventa un backend che non abbiamo" (Drive in questo caso, ma ci sono già stati altri esempi tipo Slack/Trello in regressioni passate).

### 5) Estensioni naturali (M, follow-up successivo, NON in questo task)
- "preventivi emessi questa settimana / questo mese" (parametrico).
- "preventivi per [Condominio La Bussola]" → query con `condominioName like` o `clientName like`.
- "apri preventivo PRE-001/2026" → reuse di `handleApriBozza` ma cercando in `docfin_documents` per `number`.
- Link diretto al PDF (`pdfUrl`) cliccabile in chat — già supportato dal patch link di `app.js:escapeHtmlAndAutolink`.

## Rischi e alternative

### R1 — Tipo di `dateIssued` non garantito
Su `docfin_documents` `dateIssued` può essere: (a) Timestamp Firestore quando creato dalla DOC PWA, (b) string "YYYY-MM-DD" quando creato da admin-rtidf, (c) string ISO quando creato da GRAPH. **Attenzione:** la query Firestore con `>=` Timestamp confronta solo se i record sono Timestamp; record stringa vengono ignorati silenziosamente.
**Mitigazione:** doppia query — una con range Timestamp, una con `where("dateIssued","==",todayStr)` — e merge dei risultati per id. Stimare l'impatto guardando 5-10 record reali su `garbymobile-f89ac/docfin_documents`.

### R2 — Permessi cross-project
`getCosminaDb()` richiede che il service account `nexo-hub-15f2d` abbia `datastore.user` (o `datastore.viewer`) su `garbymobile-f89ac`. È già configurato (lo usano `ares.js`, `echo.js`, `echo-wa-inbox.js`, `echo-digest.js` con successo). Nessun lavoro extra.
**Verifica:** `ares.js:32` ha già il messaggio di errore se manca, riusare lo stesso pattern.

### R3 — Volume `docfin_documents`
È una collection condivisa da TUTTA la suite (RTI, RTIDF, AFF, PRV, …). Se il filtro `type=="PRV"` non è abbastanza selettivo (es. record `type` mancante in vecchi record), serve un secondo filtro o limit alto. Per la query "oggi" l'impatto è basso (max 10 PRV/giorno).

### R4 — Naming/UX della risposta
La regola NEXUS Chat (CLAUDE.md) vieta **bullet, bold, emoji, formato campo:valore**. La risposta deve essere **discorsiva**. Esempio "buono":
> "Oggi su DOC c'è un preventivo: PRE-001/2026 per Condominio La Bussola, 1.220 euro. Te lo faccio aprire?"

NON:
> "**Preventivi DOC oggi:**\n· PRE-001/2026 - Condominio La Bussola - €1.220"

### Alternative scartate

- **A1: lasciare a Haiku con prompt più severo.** Senza un handler reale, Haiku continuerà a non avere dati e a inventare. Bocciato.
- **A2: linkare direttamente acg-doc.web.app filtrato.** Funziona ma è UX peggiore (Alberto ha chiesto NEXUS Chat in voce: deve avere la risposta, non un link).
- **A3: leggere `calliope_bozze` con `status="approvato"` invece di `docfin_documents`.** I record approvati restano in `calliope_bozze` con `status="approvato"` ma la fonte di verità per "su DOC" è `docfin_documents`. Inoltre `calliope_bozze` non ha sempre il numero finale o il `pdfUrl`. Bocciato — ma è un fallback se R2 fallisce.

## Effort stimato

**Totale: S (small)** — 60-90 minuti netti.

| Step | Effort |
|---|---|
| 1) handler `handleDocfinPreventiviOggi` (incluso fallback R1) | S — 30' |
| 2) wiring DIRECT_HANDLERS | S — 10' |
| 3) update system prompt Haiku | S — 10' |
| 4) anti-allucinazione su `nessuno`+confidenza bassa | S — 15' |
| Test FORGE (smoke "abbiamo preventivi su doc oggi" → handler chiamato, no Haiku) | S — 15' |
| Deploy + email report + commit | S — 10' |

Estensioni R1+R5 (per data parametrica, per cliente, apri PDF) restano come task follow-up separati: M (mezza giornata).

## Test di accettazione (per la fase di implementazione)

1. **Smoke:** `curl nexusTestInternal` con `userMessage="abbiamo preventivi su doc oggi?"` → handler `handleDocfinPreventiviOggi` viene invocato (verificabile con `_handlerCollega`/`_handlerName` nella response), Haiku NON è interpellato.
2. **Risposta discorsiva:** la risposta NON contiene "Drive", "cartelle", "filtra per data" né bullet/bold/emoji.
3. **Vuoto:** se non ci sono PRV oggi → risposta tipo "Oggi su DOC non risultano preventivi emessi."
4. **Pieno:** con almeno un PRV oggi (test counter `nexo_test_counters/preventivo` o creandone uno via flusso reale) → risposta cita numero + cliente + totale.
5. **Cross-project:** verifica che la lettura di `docfin_documents` su `garbymobile-f89ac` funzioni (già verificato su altri handler).
