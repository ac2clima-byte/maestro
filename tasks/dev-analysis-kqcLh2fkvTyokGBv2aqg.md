# Analisi dev-request kqcLh2fkvTyokGBv2aqg

**Origine:** segnalazione "bug_from_chat" dal bottone 🐛 in NEXUS chat.
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** nx_xz7acxrpmog4p0cw
**Data:** 2026-04-26 18:55 UTC
**Nota di Alberto:** (nessuna)

> Il template del file dev-request non riporta la conversazione. Letta da
> Firestore (`nexo_dev_requests/kqcLh2fkvTyokGBv2aqg`).
>
> **Nota:** è la **terza** segnalazione consecutiva sullo stesso problema.
> Vedere anche `dev-analysis-Tsa4wB0LG6KfM57LKbuI.md`,
> `dev-analysis-0YdtBOK9hBqJvYpkrWDd.md`,
> `dev-analysis-AQcVigv15fYK4W4gmmzP.md`. Quest'ultima ha individuato la
> CAUSA SBAGLIATA. Questa analisi corregge la diagnosi.

## Conversazione segnalata

| ruolo | contenuto |
|---|---|
| ALBERTO | "che interventi aveva federico giovedì 23/04/2026?" |
| NEXUS | "Federico il 23/04/2026 non ha interventi." (stato: completata) |

(Identica conversazione e identica risposta sbagliata della segnalazione AQcVigv15fYK4W4gmmzP di 4 minuti prima. Alberto ha riprovato in una sessione nuova `nx_xz7acxrpmog4p0cw` — il bug non è stato fixato tra una segnalazione e l'altra.)

## Verifica dei dati reali — il vero motivo

Ho letto la card target su `bacheca_cards/card_1776698118299_hpmunu0k4`:

```
listName:   "INTERVENTI"
techName:   "DAVID"                  ← singolo tecnico = DAVID
techNames:  ["DAVID", "FEDERICO"]    ← array multi-tecnico = entrambi
stato:      "chiuso"
inBacheca:  true
due:        "2026-04-23T12:00:00.000Z"
name:       "DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA - Intervento concluso DA DAVID IL 23/04/2026 ALLE ORE 16:59"
```

Federico **è co-assegnato** all'intervento, ma compare solo in `techNames[]`. Il `techName` primario è "DAVID".

E ho rifatto la query "Federico" con `where("techName","==","FEDERICO")` su Firestore: ritorna 0 risultati per il 23/04/2026. Conferma: la card target NON viene mai pescata da una query filtrata su `techName`.

## Diagnosi — la VERA causa

`projects/iris/functions/handlers/ares.js:223-227`:
```js
let tecnico = data.techName;
if (!tecnico && Array.isArray(data.techNames) && data.techNames.length) {
  tecnico = String(data.techNames[0]);
}
if (tecnicoFilter && !String(tecnico || "").toLowerCase().includes(tecnicoFilter)) return;
```

Il fallback su `techNames[]` scatta **solo se `techName` è vuoto**. Per la card target `techName="DAVID"` quindi:
- `tecnico = "DAVID"`
- `String("DAVID").toLowerCase().includes("federico")` → `false`
- **`return` → la card viene scartata**

Federico esce dalla lista anche se è co-assegnato. Il filtro tecnico è troppo stretto.

**L'analisi precedente (`AQcVigv15fYK4W4gmmzP.md`) aveva ipotizzato come causa primaria il `limit(200)` senza `orderBy`** (probabilità che la card sia nei primi 200 = 2.5%). Quella è una causa secondaria reale, ma anche con un limit più alto la card sarebbe stata scartata dal filtro tecnico. La **vera** causa primaria è il filtro `techName` che ignora `techNames[]`.

## Bug correlati che si manifestano insieme

### Bug A — filtro tecnico ignora `techNames[]` quando `techName` è valorizzato
Documentato sopra. **È il vero motivo per cui la risposta dice "non ha interventi"**.

### Bug B — limit 200 senza filtri data
Già descritto in `AQcVigv15fYK4W4gmmzP.md`. Va comunque fixato perché su 7.793 cards INTERVENTI la query pesca a caso.

### Bug C — render boardName generico per ZZ000
Il `boardName` "ZZ000 - CLIENTI PRIVATI E GENERICI" è poco utile per Alberto. Andrebbe usato `name` come fallback. Già descritto in `AQcVigv15fYK4W4gmmzP.md`.

### Bug D — risposta "Federico il 23/04/2026..." senza giorno settimana
La risposta osservata "Federico **il** 23/04/2026 non ha interventi" non è il template del mio handler ("Federico **giovedì** 23/04/2026 non ha interventi"). Quindi il content viene da `intent.rispostaUtente` di Haiku, non dal direct handler. Possibili spiegazioni:
- L'handler ha tornato `{ data: ... }` senza `content` (improbabile guardando il codice).
- Il `direct.content` è `null` o stringa vuota.
- O — più probabile — il direct handler **non è stato eseguito**: il `direct: true` salvato nel doc `nexus_chat` deriva dal `tryDirectAnswer` ma con un risultato che ha disabilitato il branch. Vedi `index.js:534-541`.

Conferma diretta: il content di Haiku ricalca il pattern "X il DATA" senza inventare interventi. Quindi anche Haiku, non avendo dati dall'handler, ha estrapolato dalla query un "non ho informazioni" travestito.

### Bug E — Alberto continua a segnalare lo stesso bug
Alberto ha segnalato 4 volte (Tsa4wB0LG6KfM57LKbuI, 0YdtBOK9hBqJvYpkrWDd, AQcVigv15fYK4W4gmmzP, kqcLh2fkvTyokGBv2aqg) in 30 minuti. Le prime tre **sono state analizzate ma NON implementate** (per policy "NON implementare, solo analizzare"). Quindi il bug rimane aperto e Alberto continua a sbatterci contro.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 223-227 | filtro tecnico: legge `techName` ma ignora `techNames[]` quando primario è valorizzato — **CAUSA PRIMARIA** |
| `projects/iris/functions/handlers/ares.js` | 175-189 | query Firestore con limit insufficiente — causa secondaria (tagliando il pool prima del filtro) |
| `projects/iris/functions/handlers/ares.js` | 296-303 | render: usa `boardName` (= ZZ000 generico) ignorando `name` — render bug |
| `projects/iris/functions/index.js` | 534-541 | dispatch `direct.content` vs `intent.rispostaUtente` — possibile fonte del "il" senza giorno |
| `tasks/dev-analysis-AQcVigv15fYK4W4gmmzP.md` | tutto | analisi precedente da AGGIORNARE: causa primaria errata, va sostituita |
| `context/memo-firestore-garbymobile.md` | 215-228 | schema bacheca_cards: documenta `techName` (singolo) + `techNames` (array). Conferma il caso multi-tecnico |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Match tecnico include `techNames[]` SEMPRE (S, critica)
**Dove:** `ares.js:223-227`.
**Cosa fa:** modificare il filtro così:
```js
const allTechs = [];
if (data.techName) allTechs.push(String(data.techName));
if (Array.isArray(data.techNames)) {
  for (const t of data.techNames) if (t) allTechs.push(String(t));
}
const techHay = allTechs.join("|").toLowerCase();
if (tecnicoFilter && !techHay.includes(tecnicoFilter)) return;
```
**Perché:** è la fix critica che risolve il caso reale di Alberto. Multi-tecnico è uno schema legittimo (interventi grossi con due risorse), il filtro deve riconoscerli entrambi.

**Render coerente:** anche nel rendering della riga, mostrare TUTTI i tecnici se più di uno:
```js
const tecRender = allTechs.length > 1 ? allTechs.join(" + ") : allTechs[0] || "-";
```
Output: "23/04/2026, … stato chiuso, tecnici DAVID + FEDERICO".

### 2) Query Firestore con `array-contains` su techNames[] (M)
**Dove:** `ares.js:175-189`, in alternativa o complemento alla strategia "tecnico esatto".
**Cosa fa:** quando c'è `tecnicoFilter`, fai DUE query in parallelo e merge:
```js
const tecnicoUpper = tecnicoFilter.toUpperCase();
const [snap1, snap2] = await Promise.all([
  cosm.collection("bacheca_cards").where("listName","==","INTERVENTI").where("techName","==",tecnicoUpper).limit(200).get(),
  cosm.collection("bacheca_cards").where("listName","==","INTERVENTI").where("techNames","array-contains",tecnicoUpper).limit(200).get(),
]);
const seen = new Set();
const merged = [];
for (const s of [snap1, snap2]) s.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); merged.push(d); } });
```
**Perché:** sfrutta gli indici Firestore esistenti (techName e techNames sono entrambi indicizzabili) e copre **tutti** gli interventi del tecnico, sia primari sia co-assegnati.

**Caveat:** `array-contains` su `techNames` richiede l'indice; se non c'è, `firestore.indexes.json` dichiarato in deploy. Lo verifico nel rischio R1.

### 3) Resto delle proposte già documentate in AQcVigv15fYK4W4gmmzP
Mi limito a richiamare i fix complementari (vedi quel file per dettagli):
- Render fallback su `name` per `boardName` ZZ000.
- Logging dettagliato con scanned/filtered.
- Diagnostica nella risposta vuota.
- Test di accettazione mirato sulla card target.

### 4) Aggiornare l'analisi AQcVigv15fYK4W4gmmzP (S, opzionale)
**Dove:** `tasks/dev-analysis-AQcVigv15fYK4W4gmmzP.md`.
**Cosa fa:** aggiungere una nota in cima che dice: "La causa primaria identificata in §Diagnosi è risultata SECONDARIA. Vedi `dev-analysis-kqcLh2fkvTyokGBv2aqg.md` per la causa primaria reale (filtro `techName` che ignora `techNames[]`)."

**Perché:** chi legge l'analisi vecchia come riferimento si aspetta correttezza. Linkare al fix.

### 5) Test mirato (S)
**Dove:** nuovo `projects/iris/test-ares-multi-tecnico.mjs`.
**Casi:**
1. Card multi-tecnico (`techName=A, techNames=[A,B]`) → query "interventi di B" deve trovarla.
2. Card singolo (`techName=A, techNames=null`) → query "interventi di A" deve trovarla.
3. Card singolo con techNames array singolo (`techName=A, techNames=[A]`) → idem.
4. Tre tecnici (`techName=A, techNames=[A,B,C]`) → query su B o C deve trovarla.

## Rischi e alternative

### R1 — Indice `array-contains` su `techNames`
Firestore richiede un indice esplicito per `array-contains`. Se non esiste, la query throwa `FAILED_PRECONDITION`. Mitigazione: verificare in console; se manca, deploy l'indice (1 minuto). Fallback: rimuovere il `where("techNames","array-contains",...)` e fare una query più ampia + filtro client-side (più costoso ma sempre funziona).

### R2 — Cardinalità `techNames`
Se molti interventi sono multi-tecnico, la query parallela su `techName` + `techNames` può raddoppiare il volume di read. Mitigazione: fare prima la query su `techName` (più selettiva), poi solo se 0 risultati lanciare la `array-contains`. Riduce read in ~80% dei casi.

### R3 — Render con più tecnici
"Tecnici DAVID + FEDERICO" è informazione utile. Però se l'utente ha chiesto specificamente di Federico, vuole vedere i SUOI interventi: potrebbe essere disorientante vedere "tecnici DAVID + FEDERICO" come label. Mitigazione: nel sommario/intro evidenziare il tecnico richiesto: "Federico il 23/04/2026 ha avuto 1 intervento (co-assegnato a DAVID): …". Più trasparente.

### R4 — Card con `techName` errato (es. "FEDERICO BERBERI" tutto in `techName`)
La rubrica `cosmina_contatti_interni` ha un caso noto (CLAUDE.md): "BERBERI ERGEST" è dato sporco per "LESHI ERGEST". Mitigazione: il fix "match include techNames" non peggiora questi casi (al massimo un falso positivo se compare il nome anche in `techNames`). Ma vale la pena loggare casi anomali.

### Alternative scartate

- **A1: ignorare `techName` e usare solo `techNames[]`**: cambia semantica del DB. Il `techName` resta la fonte canonica del primario. Bocciato.
- **A2: aggiornare lo schema (sostituire `techName` con `assignedTechs[]`)**: refactor cross-app. Bocciato — fuori scope.

## Effort stimato

**Totale: S-M (small-medium)** — 1.5-2 ore. **Critica per priorità.**

| Step | Effort |
|---|---|
| 1) match tecnico include `techNames[]` (filter + render) | S — 30' |
| 2) query parallela `techName` + `array-contains techNames` | M — 60' |
| 3) richiami fix complementari (render ZZ000, logging, etc) | S — 30' |
| 4) update analisi AQcVigv15fYK4W4gmmzP con nota | S — 5' |
| 5) test multi-tecnico | S — 30' |
| Deploy + test live + email + commit | S — 15' |

## Test di accettazione

1. **Caso reale di Alberto:** "che interventi aveva federico giovedì 23/04/2026?" → ritorna l'intervento `card_1776698118299_hpmunu0k4` (Via Toscanini Alessandria), evidenziando che è co-assegnato anche a David.
2. **Card singolo:** "interventi di marco lunedì scorso" → ritorna i suoi 2 interventi (techName=MARCO).
3. **Filtra co-assegnato:** "interventi di david giovedì 23" → ritorna la stessa card (techName primario = DAVID).
4. **Render esplicito:** "Federico ha avuto 1 intervento. Il 23/04/2026, DARE IL BIANCO IN VIA TOSCANINI ALESSANDRIA, stato chiuso, co-assegnato a DAVID."
5. **Tecnico non co-assegnato:** "interventi di marco giovedì 23" → la card target NON deve apparire (Marco non è in `techNames`).

---

## ⚠️ Nota operativa

Alberto sta segnalando lo stesso bug in serie. La policy "solo analisi, no implementazione" produce 4 dev-request consecutive sullo stesso problema. Sarebbe utile dare ad Alberto un **task di implementazione** che combini:
- fix multi-tecnico (questa analisi),
- limit/orderBy sulla query bacheca_cards (analisi AQcVigv15fYK4W4gmmzP),
- render ZZ000 con fallback `name` (analisi AQcVigv15fYK4W4gmmzP),
- logging diagnostico (per debug futuri).

In modo che il prossimo bug report contenga una casistica nuova invece dello stesso bug ripetuto.
