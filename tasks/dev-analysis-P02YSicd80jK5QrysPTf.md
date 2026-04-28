# Analisi dev-request `P02YSicd80jK5QrysPTf`

**Data:** 2026-04-28
**Tipo:** bug_from_chat — risposta inventata
**Sessione:** `nx_jx9kxwiwmoiggi5d`
**Nota Alberto:** "risposta non pertinente"

## Sintesi

> ALBERTO: "trova l'impianto targa PH4QC34139879603"
>
> NEXUS (stato: `in_attesa_collega`): "Ho trovato l'impianto targa
> PH4QC34139879603, è stato programmato per il prossimo mese."

**NEXUS ha inventato la risposta.** Nessun handler ha cercato la targa.
La frase mostrata all'utente è una `rispostaUtente` ottimistica generata
dal LLM (Haiku o fallback Ollama 1.5b) che annuncia come fatto qualcosa
che non è stato fatto.

In realtà ci sono **3 bug correlati** che producono questo comportamento:

1. **Bug 1 — `finalContent = intent.rispostaUtente` quando `in_attesa_collega`**:
   `index.js:622+` mostra all'utente la frase del LLM come se fosse il
   risultato anche quando il messaggio è solo stato postato in lavagna
   senza alcun collega che l'abbia processato.

2. **Bug 2 — Lavagna senza listener per dikea/memo/charta/etc.**: solo
   `ares` (interventi/guasti) e `orchestrator` (preventivi) hanno
   `onDocumentCreated` listener. Tutti gli altri colleghi async sono
   write-only — NEXUS posta lavagna che resta orfana per sempre.

3. **Bug 3 — Manca handler "cerca impianto per targa"**: nessuna funzione
   in `dikea.js`/`memo.js` cerca per `targa_cit` in `cosmina_impianti`.
   Anche se il routing fosse corretto, non ci sarebbe nulla da eseguire.

---

## Bug 1 — Mostrare `rispostaUtente` LLM come risultato finale

### Causa

`projects/iris/functions/index.js:622-649`:

```js
let finalContent = intent.rispostaUtente;        // ← frase LLM ottimistica
let stato = "assegnata";
let lavagnaId = null;

if (direct && !direct._failed) {
  finalContent = direct.content || finalContent; // handler regex eseguito
  stato = "completata";
} else if (direct && direct._failed) {
  finalContent = direct.content || finalContent;
  stato = "errore_handler";
} else if (intent.collega && intent.collega !== "nessuno" && intent.collega !== "multi") {
  // Postamessage on Lavagna for async processing
  try {
    lavagnaId = await postLavagnaFromNexus({ ... });
    stato = "in_attesa_collega";          // ← ma finalContent NON viene riscritto
  } catch (e) { ... }
}
```

Quando il LLM dice `intent.rispostaUtente = "Ho trovato l'impianto X..."`,
quella frase finisce in `finalContent` e viene scritta come messaggio
assistant **mai sostituita** dal risultato reale (perché non c'è nessun
listener che lo produrrà). L'utente legge una promessa come se fosse un
fatto compiuto.

Il system prompt NEXUS (`nexus.js:NEXUS_SYSTEM_PROMPT`) chiede al LLM di
scrivere `rispostaUtente` con **promesse del tipo** "Ti mostro le ultime
email" o "Apro il dossier". Funziona quando l'handler regex/Haiku
risolve immediatamente, ma quando il messaggio finisce in lavagna senza
listener il testo resta una promessa non mantenuta.

### File coinvolti

- `projects/iris/functions/index.js:622-649` — branch `in_attesa_collega`
- `projects/iris/functions/handlers/nexus.js:50-77` — REGOLE TONO che
  istruisce il LLM a scrivere "Ti mostro X" come `rispostaUtente`
- `projects/iris/functions/handlers/nexus.js:282-292` — `parseAndValidateIntent`
  estrae `rispostaUtente` dal LLM

### Proposta — sostituire `finalContent` quando `in_attesa_collega`

```js
} else if (intent.collega && intent.collega !== "nessuno" && intent.collega !== "multi") {
  try {
    lavagnaId = await postLavagnaFromNexus({ ... });
    stato = "in_attesa_collega";
    // ↓ NUOVO: Sostituisci la frase ottimistica del LLM con un placeholder
    // onesto che dichiara cosa sta succedendo davvero.
    finalContent = `Ho passato la richiesta a ${intent.collega} (azione: ${intent.azione}). Aspetto la sua risposta…`;
  } catch (e) { ... }
}
```

In più, se sappiamo a priori che il collega di destinazione non ha un
listener attivo (vedi Bug 2), rispondere subito con un messaggio onesto:

```js
const COLLEGHI_CON_LISTENER = new Set(["ares", "orchestrator"]);
if (intent.collega && !COLLEGHI_CON_LISTENER.has(intent.collega)) {
  // Niente listener async per questo collega → non fingere
  finalContent = `Non ho un handler attivo per ${intent.collega}/${intent.azione}. Lo registro come richiesta di sviluppo.`;
  // Salva come dev request per non perdere la richiesta
  await tryInterceptDevRequest({ userMessage, userId, sessionId });
}
```

### Effort: **S** (15-30 min)

Modifica chirurgica a `index.js:622-649`. Test FORGE con messaggi che
finiscono in lavagna (es. "trova impianto targa X").

---

## Bug 2 — Lavagna senza listener per dikea/memo/charta/etc.

### Diagnosi

`grep onDocumentCreated.*nexo_lavagna` mostra **solo 2 listener**:

- `aresLavagnaListener` (`index.js:1301`) — filtra `to === "ares"` + tipo
  intervent/guasto
- `orchestratorLavagnaListener` (`index.js:1899`) — preventivi

Per **dikea, memo, charta, emporion, delphi, pharo, calliope, chronos,
echo, iris** non c'è alcun trigger. Quando NEXUS posta `to: "dikea"` in
`nexo_lavagna`, il documento resta `status: "pending"` indefinitamente.

### Conseguenze

- Le richieste finiscono nel "buco nero" della lavagna
- NEXUS dichiara `in_attesa_collega` ma l'attesa non finirà mai
- Il counter potrebbe accumulare migliaia di documenti orfani in
  `nexo_lavagna` (controllo periodico raccomandato)
- L'utente perde fiducia perché la promessa LLM non si avvera

### File coinvolti

- `projects/iris/functions/index.js:1301` — `aresLavagnaListener`
- `projects/iris/functions/index.js:1899` — `orchestratorLavagnaListener`
- `projects/iris/functions/handlers/nexus.js:670-700` — `postLavagnaFromNexus`

### Proposta — duplice approccio

**Opzione A (consigliata, breve termine)**: NEXUS non deve postare in
lavagna per colleghi senza listener. Tutti i colleghi sincroni hanno già
DIRECT_HANDLERS che eseguono l'handler e ritornano `direct.content`.
Se nessun handler regex matcha, **non delegare alla lavagna** — invece:

- Se Haiku/Ollama hanno scelto un collega che NON ha listener attivo, e
  nessun DIRECT_HANDLER regex+azione matcha, ritornare un messaggio chiaro
  ("Non ho ancora un handler per X. La richiesta è registrata come dev
  request.").
- Salvare automaticamente come dev request (`tryInterceptDevRequest`)
  così non si perde la richiesta.

**Opzione B (medio termine)**: implementare listener per i colleghi
che oggi non li hanno. Ma per quanto descritto in Bug 3 (servono handler
nuovi) sarebbe lavoro proporzionale al numero di colleghi × azioni.

### Effort: **M** (30-60 min) per opzione A

- 15 min: definire `COLLEGHI_CON_LISTENER` set + branch in `index.js:632`
- 15 min: cleanup script per documenti `nexo_lavagna` orfani (opzionale)
- 15 min: deploy + test FORGE

---

## Bug 3 — Manca handler "cerca impianto per targa CIT"

### Diagnosi

`cosmina_impianti` (collection Firestore) contiene gli impianti con campo
`targa_cit` (vedi `dikea.js:37`, `memo.js:153`). Esiste:

- `dikea/scadenze_curit` — lista scadenze ordinate per data
- `dikea/impianti_senza_targa` — lista chi NON ha targa
- `memo/dossier_cliente` — storico per cliente (NON per targa)

Ma **nessuno cerca un impianto specifico per targa**. La query
"trova impianto targa X" non ha handler corrispondente. Il LLM allora
sceglie il collega più semanticamente vicino (probabilmente `dikea` o
`memo`) e inventa un'azione che non esiste.

### File coinvolti

- `projects/iris/functions/handlers/dikea.js` — solo scadenze + senza_targa
- `projects/iris/functions/handlers/memo.js` — dossier per cliente/condominio
- `projects/iris/functions/handlers/nexus.js:171-176` — schema dikea
- `projects/iris/functions/handlers/nexus.js:158-163` — schema memo

### Proposta — nuovo handler `dikea/cerca_per_targa`

Aggiungere a `dikea.js`:

```js
export async function handleDikeaCercaPerTarga(parametri, ctx) {
  const targaInput = String(parametri.targa || "").trim().toUpperCase();
  if (!targaInput) {
    return { content: "Mi serve la targa CIT da cercare. Esempio: 'trova impianto targa PH4QC34139879603'." };
  }
  const cosm = getCosminaDb();
  // Esatta + prefix match (le targhe possono avere case mixed)
  const exactSnap = await cosm.collection("cosmina_impianti")
    .where("targa_cit", "==", targaInput).limit(5).get();
  if (exactSnap.empty) {
    // Fallback: scansione manuale per prefix/contains (max 1000)
    const allSnap = await cosm.collection("cosmina_impianti").limit(1000).get();
    const matches = [];
    allSnap.forEach(d => {
      const t = String((d.data() || {}).targa_cit || "").toUpperCase();
      if (t === targaInput || t.includes(targaInput) || targaInput.includes(t)) {
        matches.push({ id: d.id, ...d.data() });
      }
    });
    if (!matches.length) {
      return { content: `Nessun impianto trovato con targa "${targaInput}". Verifica che la targa sia corretta.` };
    }
    // Render dei match...
  }
  // Render del/i risultato/i: condominio, indirizzo, marca, modello,
  // ultima manutenzione, scadenza CIT
}
```

E aggiungere DIRECT_HANDLER L1 in `nexus.js`:

```js
{ match: (col, az, ctx) => {
  const m = (ctx?.userMessage || "").toLowerCase();
  if (col === "dikea" && /(cerca_targa|trova_targa|per_targa|targa_cit)/.test(az)) return true;
  // Match diretto: "trova/cerca/dimmi impianto targa X" o targa-only se sembra una CIT
  if (/\b(?:trov\w+|cerc\w+|dimmi|dove\s+sta|quale|qual\s+è).*\bimpiant[oi]\b.*\btarg/i.test(m)) return true;
  if (/\btarga\s+([A-Z]{2}\d[A-Z]\d{3,12}|\d{8,15})/i.test(m)) return true;
  return false;
}, fn: handleDikeaCercaPerTarga },
```

E aggiornare lo schema NEXUS in `nexus.js:171`:

```
- dikea (compliance): scadenze_curit, impianti_senza_targa, cerca_per_targa
  cerca_per_targa — parametri: {targa}. Trigger: "trova/cerca impianto targa X".
```

### Effort: **M** (45-60 min)

- 20 min: scrivere `handleDikeaCercaPerTarga` con render
- 5 min: aggiungere DIRECT_HANDLER + schema NEXUS_SYSTEM_PROMPT
- 5 min: aggiornare `buildOllamaSystemPrompt` con esempio few-shot
- 15 min: deploy + test FORGE con targhe reali (verifica permessi
  cross-project su `cosmina_impianti`)
- 10 min: regression test che query esistenti dikea non si rompano

---

## Riepilogo proposta

| Bug | Severità | Effort | Priorità |
|---|---|---|---|
| **1** finalContent = LLM `rispostaUtente` su `in_attesa_collega` | Alta | S | 1 |
| **2** Lavagna senza listener per la maggior parte dei colleghi | Alta (debito strutturale) | M | 2 |
| **3** Manca handler ricerca per targa | Media (feature mancante) | M | 3 |

**Ordine consigliato**:

1. **Bug 1 prima** (S, fix immediata): elimina la frase ingannevole
   indipendentemente dagli altri bug. Anche con Bug 2/3 non risolti,
   l'utente vede "Ho passato la richiesta a dikea, aspetto…" invece di
   "Ho trovato l'impianto..." → onesto invece di bugiardo.

2. **Bug 2 secondo** (M): risolve il "buco nero" lavagna. Approccio
   opzione A (NEXUS non posta a colleghi senza listener) è il più
   sicuro e veloce.

3. **Bug 3 terzo** (M): implementa la feature richiesta. Una volta
   risolti Bug 1+2, l'utente saprebbe sempre cosa NEXUS non sa fare;
   questo step lo rende capace di una nuova cosa specifica.

## Test plan

**Bug 1**:
```bash
# FORGE: inviare query che cade su collega senza handler diretto
curl -m 30 -X POST .../nexusTestInternal \
  -H "X-Forge-Key: nexo-forge-2026" \
  -d '{"sessionId":"forge-test-bug1","message":"trova l'impianto targa PH4QC34139879603"}'
# Atteso: stato="in_attesa_collega" MA reply="Ho passato la richiesta a dikea, aspetto…"
# (NON la frase inventata "Ho trovato l'impianto…")
```

**Bug 2**: verifica che dopo la fix, `nexo_lavagna` non riceva
documenti `to=dikea/memo/charta/etc.` orfani. Cleanup script una tantum
per smaltire i pendenti pre-fix.

**Bug 3**:
```bash
# Tre casi da testare con targhe reali (chiedere ad Alberto)
- targa esatta esistente → dossier completo (condominio, indirizzo, scadenza)
- targa prefix/parziale → top match con punteggio
- targa inesistente → "Nessun impianto trovato. Verifica la targa."
```

## Stato collaterale

- Anthropic Haiku ancora -0.03 USD da 36h. Tutti i routing fuori da
  regex L1 cadono su Ollama 1.5b → soggetti ad allucinazione `collega`.
  Bug 1 è la rete di sicurezza più importante per non mostrare cose
  false all'utente quando il routing LLM sbaglia.
- `nexo_lavagna` collection probabilmente accumula doc orfani — da
  controllare e fare cleanup periodico (anche dopo Bug 2 fix).

## File da modificare (riepilogo)

| File | Riga | Modifica |
|---|---|---|
| `projects/iris/functions/index.js` | 622-649 | sostituisci `finalContent` su `in_attesa_collega` con messaggio onesto + COLLEGHI_CON_LISTENER set |
| `projects/iris/functions/handlers/dikea.js` | nuovo | `handleDikeaCercaPerTarga(parametri, ctx)` |
| `projects/iris/functions/handlers/nexus.js` | 580+ | DIRECT_HANDLER L1 per `dikea/cerca_per_targa` |
| `projects/iris/functions/handlers/nexus.js` | 171-176 | aggiornare schema dikea con `cerca_per_targa` |
| `projects/iris/functions/handlers/nexus.js` | 1486+ | esempio few-shot Ollama "trova impianto targa X" → dikea/cerca_per_targa |
| `projects/iris/functions/index.js` | export | `export { handleDikeaCercaPerTarga } from ...` |
