# Compound intent ARES+ECHO — Opzione A (handler chirurgico)

## Contesto

Alberto chiede in NEXUS: "manda ad alberto un messaggio wa con la sintesi
dei suoi interventi di domani"

NEXUS oggi esegue SOLO la query ARES (lista interventi domani) e si ferma.
Il WA non parte. Causa: routing intent è single-collega — un messaggio =
un Collega = un'azione. Non c'è meccanismo di "compound intent".

L'analisi completa è in `tasks/dev-analysis-ORZvCQkiUMwxOSx6SRkR.md`.
Tre opzioni proposte, **opzione A scelta** (chirurgica, 1-2 ore, FORGE-testabile,
no rischio allucinazioni LLM).

## Cosa fare — Opzione A

Aggiungere un handler dedicato che riconosce il pattern composto e
esegue lo step ARES + lo step ECHO in sequenza, propagando il risultato
del primo come body del secondo.

### Step 1 — Nuovo handler in nexus.js

Aggiungi a `projects/iris/functions/handlers/nexus.js` una nuova funzione
handler vicino agli altri (cerca un buon punto, tipo dopo
`handleAresInterventiAperti` o simile):

```js
// Compound: ARES interventi + ECHO WhatsApp
// Pattern: "manda (wa|whatsapp|messaggio) (a|al|per) X con (sintesi|riepilogo|elenco) (interventi|agenda|lavoro) [domani|oggi|...]"
async function handleCompoundAresEchoWaInterventi({ userMessage, userId, sessionId, context }) {
  const m = String(userMessage || "");

  // Estrai destinatario e range temporale
  const destMatch = /\bmand[ai]\s+(?:un\s+)?(?:messaggio\s+)?(?:wa|whatsapp|messaggio)\s+(?:a|al|per)\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)?)\b/i.exec(m);
  const tecnico = destMatch ? destMatch[1].toUpperCase().trim() : null;
  if (!tecnico) {
    return {
      content: "Non ho capito a chi mandare il messaggio. Riprova specificando il nome del tecnico.",
      data: null, _failed: true,
    };
  }

  // Range temporale (default: domani)
  let range = "domani";
  if (/\boggi\b/i.test(m)) range = "oggi";
  else if (/\bdomani\b/i.test(m)) range = "domani";
  else if (/\bdopodomani\b/i.test(m)) range = "dopodomani";

  // Step 1: lista interventi del tecnico per il range
  const ares = await import("./ares.js");
  const interventi = await ares.handleAresInterventiAperti(
    { tecnico, range },
    { userMessage, sessionId, userId, context }
  );
  const items = (interventi?.data?.items || []);

  // Caso vuoto: NON mandare WA, rispondi direttamente
  if (items.length === 0) {
    return {
      content: `${tecnico} ${range} non ha interventi. Non ho mandato nulla.`,
      data: { tecnico, range, count: 0 },
      _failed: false,
    };
  }

  // Step 2: formatta testo WA conciso
  const dataLabel = range === "oggi" ? "oggi" : range === "dopodomani" ? "dopodomani" : "domani";
  const lines = items.slice(0, 10).map((it, idx) => {
    const ora = it.oraStart || it.dueLabel || "";
    const titolo = (it.titolo || it.name || "").slice(0, 80);
    const cond = it.condominio ? ` @ ${it.condominio}` : "";
    return `${idx + 1}) ${ora} ${titolo}${cond}`.trim();
  });
  const moreLine = items.length > 10 ? `\n…e altri ${items.length - 10}` : "";
  const wabody = `Ciao ${tecnico.split(" ")[0]}, ${dataLabel} hai ${items.length} interventi:\n${lines.join("\n")}${moreLine}`;

  // Truncate a 1500 char per sicurezza
  const wabodyTrunc = wabody.length > 1500 ? wabody.slice(0, 1497) + "..." : wabody;

  // Step 3: chiama ECHO send_whatsapp (rispetta DRY_RUN della sessione)
  const echo = await import("./echo.js");
  const sendResult = await echo.handleEchoWhatsApp(
    { to: tecnico, body: wabodyTrunc },
    { userMessage, sessionId, userId, context }
  );

  if (sendResult?._failed) {
    return {
      content: `Ho preparato il riepilogo (${items.length} interventi) ma ECHO ha fallito l'invio: ${sendResult.content || "errore"}`,
      data: { tecnico, range, count: items.length, body: wabodyTrunc, echoError: true },
      _failed: true,
    };
  }

  // Successo — risposta unificata
  const dryRun = sendResult?.data?.dryRun || sendResult?.data?.isDryRun;
  const verbo = dryRun ? "Ho preparato (DRY_RUN, non inviato)" : "Ho mandato";
  return {
    content: `${verbo} a ${tecnico} il riepilogo dei ${items.length} interventi di ${dataLabel}.${dryRun ? " Vuoi che li invii davvero?" : ""}`,
    data: {
      tecnico, range, count: items.length,
      body: wabodyTrunc,
      dryRun: !!dryRun,
      echoData: sendResult?.data || null,
    },
    _failed: false,
  };
}
```

**Verifica i nomi delle funzioni**: `handleAresInterventiAperti` e
`handleEchoWhatsApp` — i nomi reali nel codebase potrebbero essere
leggermente diversi. Cerca con:

```bash
grep -n "export.*function handleAres\|export.*function handleEcho" \
  projects/iris/functions/handlers/ares.js \
  projects/iris/functions/handlers/echo.js
```

Adatta gli import e i nomi di conseguenza. Se le funzioni non sono
esportate, esportale.

### Step 2 — Registra in DIRECT_HANDLERS

In `projects/iris/functions/handlers/nexus.js`, nella lista `DIRECT_HANDLERS`,
aggiungi un nuovo entry **prima** degli handler ECHO singoli (così intercetta
prima che ECHO veda solo "manda WA"):

```js
// Compound: manda WA con sintesi interventi
{
  match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase();
    // Deve avere: verbo manda + canale wa/whatsapp/messaggio + a/al/per + nome + con sintesi/riepilogo/elenco + interventi/agenda/lavoro
    if (!/\bmand[ai]\b/i.test(m)) return false;
    if (!/\b(wa|whatsapp|messaggio)\b/i.test(m)) return false;
    if (!/\b(a|al|per)\s+[a-zà-ÿ]+/i.test(m)) return false;
    if (!/\b(sintesi|riepilogo|elenco|cosa\s+(fa|ha)|lavoro|agenda)\b/i.test(m)) return false;
    if (!/\b(interventi|agenda|lavoro|impegni)\b/i.test(m)) return false;
    return true;
  },
  fn: handleCompoundAresEchoWaInterventi,
},
```

Posizione consigliata: subito DOPO l'handler `handleSalutoNexus` e
`handleGrazieNexus`, ma PRIMA degli handler ECHO singoli e di quelli ARES
(così cattura per primo questo pattern composto).

### Step 3 — Replica anche in forge.js (per i test)

Il file `projects/iris/functions/handlers/forge.js` ha i suoi intercept
per il flusso test. Aggiungi un blocco analogo prima del blocco ECHO/ARES
esistenti:

```js
// Compound ARES+ECHO intercept (forge mirror di nexus DIRECT_HANDLERS)
try {
  const m = (message || "").toLowerCase();
  const isCompound = /\bmand[ai]\b/i.test(m)
    && /\b(wa|whatsapp|messaggio)\b/i.test(m)
    && /\b(a|al|per)\s+[a-zà-ÿ]+/i.test(m)
    && /\b(sintesi|riepilogo|elenco|cosa\s+(fa|ha)|lavoro|agenda)\b/i.test(m)
    && /\b(interventi|agenda|lavoro|impegni)\b/i.test(m);

  if (isCompound) {
    const { handleCompoundAresEchoWaInterventi } = await import("./nexus.js");
    const result = await handleCompoundAresEchoWaInterventi({
      userMessage: message, sessionId, userId, context: {}
    });
    if (result && result.content) {
      const cleaned = naturalize(result.content);
      const nexusMessageId = await writeNexusMessage(sessionId, {
        role: "assistant", content: cleaned,
        direct: { data: result.data || null, failed: !!result._failed },
        stato: result._failed ? "errore_handler" : "completata",
        modello: "compound_ares_echo",
      });
      res.status(200).json({
        query: message, reply: cleaned,
        collega: "compound", azione: "ares_echo_wa_interventi",
        stato: result._failed ? "errore_handler" : "completata",
        natural: isNatural(cleaned),
        direct: { ok: !result._failed, data: result.data || null },
        sessionId, userMsgId, nexusMessageId,
        modello: "compound_ares_echo",
        tookMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }
} catch (e) {
  logger.warn("forge: compound ares-echo intercept failed", { error: String(e).slice(0, 150) });
}
```

Devi esportare `handleCompoundAresEchoWaInterventi` da nexus.js perché
forge la importa.

### Step 4 — DRY_RUN salvaguardia

Verifica nel file `projects/iris/functions/handlers/echo.js` che il flag
DRY_RUN sia rispettato. Per le sessioni `forge-test-*` deve essere
**sempre** DRY_RUN. Per le sessioni utente reali, DRY_RUN è OFF di
default (l'utente vuole che il messaggio parta), MA aggiungi un meccanismo
di conferma esplicita per questo handler compound.

**Strategia consigliata**: per il primo deploy, **forza DRY_RUN ON anche
per sessioni utente** in `handleCompoundAresEchoWaInterventi`, e nella
risposta scrivi: "Ho preparato il messaggio (anteprima sotto). Conferma
'sì manda' per inviare davvero." Salva un `nexo_echo_pending` con
`kind: "echo_wa_compound_confirm"` e tutti i dati. Al prossimo turno
`tryInterceptEchoPending` riconosce la conferma e manda.

Questo mette un gate umano che evita che il primo bug del compound
intent mandi messaggi sbagliati ai tecnici reali.

### Step 5 — Test FORGE

```bash
NEXUS_URL="https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal"
FORGE_KEY="$(firebase functions:secrets:access FORGE_KEY --project=nexo-hub-15f2d || echo nexo-forge-2026)"
SID="forge-test-compound-$(date +%s)"

# Caso base
curl -sS -X POST "$NEXUS_URL" \
  -H "Content-Type: application/json" -H "X-Forge-Key: $FORGE_KEY" \
  -d "{\"message\":\"manda ad alberto un messaggio wa con la sintesi dei suoi interventi di domani\",\"sessionId\":\"$SID\"}" \
  | jq .

# Caso 0 interventi
curl -sS -X POST "$NEXUS_URL" \
  -H "Content-Type: application/json" -H "X-Forge-Key: $FORGE_KEY" \
  -d "{\"message\":\"manda a federico un wa con elenco interventi di oggi\",\"sessionId\":\"$SID-2\"}" \
  | jq .

# Caso variante linguistica
curl -sS -X POST "$NEXUS_URL" \
  -H "Content-Type: application/json" -H "X-Forge-Key: $FORGE_KEY" \
  -d "{\"message\":\"scrivi un messaggio whatsapp a marco con il riepilogo della sua agenda di domani\",\"sessionId\":\"$SID-3\"}" \
  | jq .
```

Tutte le risposte devono essere `stato: "completata"`, `natural: true`, e
in `direct.data` deve esserci `count`, `tecnico`, `range`, `body`,
`dryRun: true` (per le sessioni forge-test).

### Step 6 — Test pattern non-match (regression)

Verifica che pattern simili NON vengano catturati per errore:

```bash
# Solo ARES (no WA): NON deve attivare il compound
curl -sS ... -d '{"message":"interventi di alberto domani"}'
# Risposta attesa: solo lista, niente "ho mandato"

# Solo ECHO (no sintesi interventi)
curl -sS ... -d '{"message":"manda un wa a marco"}'
# Risposta attesa: ECHO chiede "cosa scrivo?"

# Saluto: NON deve attivare nulla
curl -sS ... -d '{"message":"ciao"}'
# Risposta attesa: saluto normale
```

## Output

Scrivi `results/compound-ares-echo.md` con:

```markdown
# Compound intent ARES+ECHO — Opzione A applicata

## Modifiche
- nexus.js: nuova funzione handleCompoundAresEchoWaInterventi (~80 righe)
- nexus.js DIRECT_HANDLERS: nuovo entry compound (posizione: dopo saluti, prima ECHO singoli)
- forge.js: intercept replica per test mirror
- echo.js: <eventuali modifiche per DRY_RUN compound>

## Test FORGE
- Caso base "alberto interventi domani": stato completata, count=N, dryRun=true ✅
- Caso 0 interventi: messaggio "non ha interventi", count=0, no WA mandato ✅
- Caso variante linguistica "scrivi whatsapp a marco con riepilogo agenda": ✅

## Test regression
- "interventi di alberto domani" (solo ARES): NON attiva compound ✅
- "manda un wa a marco" (solo ECHO): NON attiva compound ✅
- "ciao": saluto normale ✅

## Gate sicurezza
- Sessioni forge-test: DRY_RUN sempre ON
- Sessioni utente: prima richiesta = DRY_RUN + anteprima + chiede conferma
  Conferma "sì manda" → invia davvero (vedi nexo_echo_pending kind=echo_wa_compound_confirm)

## Pattern coperti
- "manda (wa|whatsapp|messaggio) (a|al|per) <nome> con (sintesi|riepilogo|elenco) (interventi|agenda|lavoro)"
- "scrivi (wa|whatsapp|messaggio) (a|al|per) <nome> con (riepilogo|cosa fa) (agenda|lavoro|impegni)"
- Range: oggi, domani, dopodomani

## Pattern NON coperti (out of scope, eventualmente Wave 2)
- "manda email con dossier cliente X" (ARES + MEMO + ECHO email)
- "manda preventivo a X" (CALLIOPE + ECHO email)
- Range custom ("la prossima settimana")
```

## Commit message

`feat(nexus): compound intent ARES+ECHO per riepilogo interventi via WA (risolve ORZvCQkiUMwxOSx6SRkR — opzione A)`

## Cose da NON fare

- **NON implementare l'opzione B (compound generico via Groq)**: rischio
  allucinazioni LLM, fuori scope, esplicitamente bocciato in analisi
- **NON implementare l'opzione C (orchestrator workflow)**: overkill per
  un singolo pattern
- **NON estendere a altri compound** in questo task (email+dossier,
  preventivo+ECHO): scope creep, valutiamo dopo se il pattern A regge
- **NON saltare il gate DRY_RUN+conferma per le sessioni utente reali**:
  prima volta che attiva, deve esserci un check umano
- **NON saltare i test regression**: il rischio più alto è catturare
  pattern non voluti

## Se qualcosa fallisce

Scrivi in `results/compound-ares-echo.md` esattamente lo step che ha
fallito e il messaggio d'errore. Non fare workaround creativi. Se il
test FORGE base fallisce, fermati e segnala.
