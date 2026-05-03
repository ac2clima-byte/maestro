# Fix multi-tecnico bacheca_cards (filtro techName ignora techNames[])

## Contesto

**Bug critico, 4 segnalazioni consecutive non risolte.**

Alberto chiede in NEXUS chat: "che interventi aveva federico giovedì 23/04/2026?"
NEXUS risponde: "Federico il 23/04/2026 non ha interventi."

Risposta sbagliata. Nella card `bacheca_cards/card_1776698118299_hpmunu0k4`:
- `techName: "DAVID"`
- `techNames: ["DAVID", "FEDERICO"]`
- Federico è co-assegnato. La card esiste.

Alberto ha segnalato 4 volte (Tsa4wB0LG6KfM57LKbuI, 0YdtBOK9hBqJvYpkrWDd,
AQcVigv15fYK4W4gmmzP, kqcLh2fkvTyokGBv2aqg). Tutte analizzate, **nessuna
implementata** (policy "solo analisi"). Adesso si implementa.

L'analisi completa è in `tasks/dev-analysis-kqcLh2fkvTyokGBv2aqg.md`.

## Root cause

`projects/iris/functions/handlers/ares.js:223-227`:

```js
let tecnico = data.techName;
if (!tecnico && Array.isArray(data.techNames) && data.techNames.length) {
  tecnico = String(data.techNames[0]);
}
if (tecnicoFilter && !String(tecnico || "").toLowerCase().includes(tecnicoFilter)) return;
```

Il fallback su `techNames[]` scatta SOLO se `techName` è vuoto. Per la card
target con `techName="DAVID"`:
- `tecnico = "DAVID"`
- `String("DAVID").toLowerCase().includes("federico")` → `false`
- `return` → la card viene scartata silenziosamente

Il filtro tecnico è troppo stretto.

## Cosa fare

### 1. Fix critico — match include TUTTI i tecnici

In `projects/iris/functions/handlers/ares.js` riga 223-227, sostituire il
filtro tecnico con:

```js
const allTechs = [];
if (data.techName) allTechs.push(String(data.techName));
if (Array.isArray(data.techNames)) {
  for (const t of data.techNames) {
    if (t && !allTechs.includes(String(t))) allTechs.push(String(t));
  }
}
const techHay = allTechs.join("|").toLowerCase();
if (tecnicoFilter && !techHay.includes(tecnicoFilter)) return;
```

### 2. Render coerente con multi-tecnico

Trova le righe del rendering (intorno a 296-303 secondo l'analisi) dove si
formatta la riga di intervento. Sostituire l'output del tecnico con:

```js
const tecRender = allTechs.length > 1
  ? allTechs.join(" + ")
  : (allTechs[0] || "-");
```

In modo che il render mostri "DAVID + FEDERICO" invece di solo "DAVID"
quando ci sono due tecnici.

**Caveat sul tono**: se l'utente ha chiesto Federico nello specifico, nel
sommario/intro evidenzia che è co-assegnato:
"Federico giovedì 23/04/2026 ha avuto 1 intervento (co-assegnato a DAVID): …"

### 3. Query Firestore con array-contains parallelo

In `ares.js:175-189`, quando `tecnicoFilter` è valorizzato, fare DUE query
in parallelo e mergare:

```js
const tecnicoUpper = tecnicoFilter.toUpperCase();
const [snap1, snap2] = await Promise.all([
  cosm.collection("bacheca_cards")
    .where("listName","==","INTERVENTI")
    .where("techName","==",tecnicoUpper)
    .limit(200).get(),
  cosm.collection("bacheca_cards")
    .where("listName","==","INTERVENTI")
    .where("techNames","array-contains",tecnicoUpper)
    .limit(200).get(),
]);
const seen = new Set();
const merged = [];
for (const s of [snap1, snap2]) {
  s.forEach(d => {
    if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); }
  });
}
```

**Caveat indice**: `array-contains` su `techNames` richiede un indice
Firestore. Verifica in `firestore.indexes.json` se esiste. Se non esiste:
- aggiungilo,
- deploy con `firebase deploy --only firestore:indexes --project=nexo-hub-15f2d`,
- documenta in commit message.

Se per qualche motivo l'indice non si può deployare, fallback: tieni la
SOLA query su `techName` ma applica il filtro client-side espanso del
punto 1 — non perfetto ma copre lo schema esistente.

### 4. Logging diagnostico

Aggiungi un `logger.info` o `console.log` strutturato che riporti:
- `tecnicoFilter` (input)
- `scanned` (cards ricevute dalle query)
- `filtered` (cards passate al render)
- `dropped_no_tech_match` (count)

Così la prossima volta che Alberto segnala un bug simile c'è una traccia
nei log Firebase.

### 5. Test di accettazione

Crea `projects/iris/tests/test-ares-multi-tecnico.mjs` con questi 5 casi:

1. **Caso reale Alberto**: query "interventi di federico giovedì 23/04/2026"
   → ritorna `card_1776698118299_hpmunu0k4` con render multi-tecnico
   "DAVID + FEDERICO"
2. **Card singolo**: `techName="MARCO", techNames=null` → query "marco" la trova
3. **Co-assegnato secondario**: `techName="DAVID", techNames=["DAVID","FEDERICO"]`
   → query "david" la trova
4. **Tre tecnici**: `techName="A", techNames=["A","B","C"]` → query "B" la trova
5. **Tecnico assente**: `techName="MARCO", techNames=["MARCO","LUIGI"]`
   → query "federico" NON la trova (negativo)

Esegui i test contro Firestore reale (`bacheca_cards` di garbymobile-f89ac
o ambiente di dev se esiste).

### 6. Aggiorna l'analisi precedente

In `tasks/dev-analysis-AQcVigv15fYK4W4gmmzP.md`, aggiungi una nota in cima:
"La causa primaria identificata in §Diagnosi è risultata SECONDARIA.
Vedi `dev-analysis-kqcLh2fkvTyokGBv2aqg.md` per la causa reale
(filtro `techName` che ignora `techNames[]`)."

### 7. Test FORGE end-to-end

Dopo il deploy delle Cloud Functions, testa via FORGE con il messaggio
esatto di Alberto:

```bash
NEXUS_URL="https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexusTestInternal"
FORGE_KEY="$(firebase functions:secrets:access FORGE_KEY --project=nexo-hub-15f2d || echo nexo-forge-2026)"

curl -sS -X POST "$NEXUS_URL" \
  -H "Content-Type: application/json" \
  -H "X-Forge-Key: $FORGE_KEY" \
  -d '{"message":"che interventi aveva federico giovedì 23/04/2026?","sessionId":"forge-test-multitech-'"$(date +%s)"'"}' \
  | jq .
```

Verifica che `reply` menzioni l'intervento del 23/04 in via Toscanini
Alessandria, e che riporti DAVID + FEDERICO o equivalente.

Se il test FORGE fallisce, NON committare. Riporta l'errore in fondo al
result e fermati.

## Deploy

Dopo verifica:

```bash
cd projects/iris
firebase deploy --only functions --project=nexo-hub-15f2d
# Se serve indice Firestore:
firebase deploy --only firestore:indexes --project=nexo-hub-15f2d
```

## Output

Scrivi `results/multitech-fix.md` con:

```markdown
# Fix multi-tecnico bacheca_cards — applicato

## Modifiche
- `projects/iris/functions/handlers/ares.js` righe X-Y: filtro tecnico ora include techNames[]
- `projects/iris/functions/handlers/ares.js` righe X-Y: query parallela con array-contains
- `projects/iris/functions/handlers/ares.js` righe X-Y: render mostra tutti i tecnici co-assegnati
- `projects/iris/firestore.indexes.json`: aggiunto/già presente indice array-contains su techNames
- `projects/iris/tests/test-ares-multi-tecnico.mjs`: 5 casi di test

## Test FORGE
Query: "che interventi aveva federico giovedì 23/04/2026?"
Reply: "<copia la risposta>"
Card trovata: card_1776698118299_hpmunu0k4 ✅

## Test unit
- 5/5 PASS

## Deploy
- Cloud Functions: deployate, build hash <X>
- Indice Firestore: deployato (se serve)

## Bug correlati ancora aperti (NON in questo fix)
- Bug B: limit 200 senza orderBy (analisi AQcVigv15fYK4W4gmmzP)
- Bug C: render boardName ZZ000 generico (analisi AQcVigv15fYK4W4gmmzP)
Lasciati per eventuale fix successivo perché non bloccano il caso Alberto.
```

## Commit message

`fix(ares): filtro tecnico include techNames[] (co-assegnati) — risolve segnalazioni kqcLh2fkv/0YdtBOK9/AQcVigv15/Tsa4wB0L`

## Cose da NON fare

- Non toccare lo schema (techName resta canonico per primario)
- Non rimuovere techNames[] dal fallback (lo riusano altre query)
- Non bypassare il test FORGE prima di committare
- Non implementare i fix B (limit) e C (boardName) qui dentro: scope creep

## Se qualcosa fallisce

Scrivi in `results/multitech-fix.md` esattamente lo step che ha fallito,
i log Firebase pertinenti, e fermati. Niente workaround creativi.
