# Analisi dev-request S1cwmlV6paJelUFDQ8PJ

**Origine:** bottone 🐛 dentro la chat NEXUS (`source: nexus_chat_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** `nx_b7ke804kmogym0ny`
**Data:** 2026-04-27 08:53 UTC
**Type:** `bug_from_chat`
**Nota di Alberto:** (nessuna)

> **Questa è la SECONDA segnalazione dello stesso bug in 28 minuti.** La prima
> è la dev-request `hG2j9OqdEYTczLySpWmp` del 2026-04-27 08:25 UTC, con
> identica conversazione e identica risposta sbagliata. L'analisi tecnica
> completa è già in
> **[`tasks/dev-analysis-hG2j9OqdEYTczLySpWmp.md`](./dev-analysis-hG2j9OqdEYTczLySpWmp.md)**.
> Questo file documenta il segnale rinforzato + un'ottima notizia collaterale.

## Conversazione segnalata (identica alla precedente)

| ts | ruolo | content |
|---|---|---|
| 08:53:06 | ALBERTO | "interventi di oggi?" |
| 08:53:11 | NEXUS | "Nessun intervento oggi (cercato: filtro data oggi, solo aperti)." |

`direct.data.stats`:
```json
{"source":"byListName", "queries":[{"q":"listName==INTERVENTI","count":800}], "rawCount":800, "federicoMatch":0}
```

Identico al payload della dev-request precedente. Stesso bug nel branch `byListName` di `handleAresInterventiAperti`: `where("listName","==","INTERVENTI").limit(800)` senza orderBy né filtro data → su 7.793 INTERVENTI legge 800 a caso e perde le ~7 card di oggi.

## Notizia collaterale positiva

Questa segnalazione arriva dal **bottone 🐛 chat** (`source: nexus_chat_bug_btn`, `sessionId: nx_b7ke804kmogym0ny`, conversazione allegata). Le ultime 4 dev-request di Alberto (`Wj9dq` / `B5Pj` / `fTfm` / `hG2j`) erano tutte dal bottone globale a causa del bug overlap mobile (z-index del bottone globale 70 sopra la chat 65). Il fix dell'iterazione precedente (commit `17a47cb`):
- pannello mobile z-index 65 → 80
- `body.nexus-chat-open` nasconde il bottone globale su mobile

**Conferma indiretta del fix**: Alberto è ora riuscito a usare il bottone chat → la conversazione è stata trasmessa → l'analisi può puntare al messaggio specifico. **Il fix mobile del bottone bug funziona in produzione.**

## Diagnosi (rimando)

Vedere **`dev-analysis-hG2j9OqdEYTczLySpWmp.md`** per:
- Bug A: branch `byListName` con limit(800) senza orderBy/range data → causa primaria
- Bug B: `_isListInterventi` esclude `LETTURE RIP`, `DA VALIDARE`, `OGGI`
- Bug C: query Firestore filtra solo `listName==INTERVENTI` exact, mai legge `ACCENSIONE/SPEGNIMENTO/TICKET DA CHIUDER`
- Bug D: risposta non dichiara dove ha cercato
- Bug E: comportamento divergente tra query con tecnico (funziona) e senza tecnico (rotto)

Verifica reale dati 27/04/2026 (eseguita 28 min fa, ancora valida): **11 interventi di oggi** (6 INTERVENTI aperti + 1 chiuso + 3 LETTURE RIP + 1 DA VALIDARE) sparsi tra David, Marco, Antonio, Federico, Lorenzo, Victor.

## Nuove evidenze (rispetto a hG2j9OqdEYTczLySpWmp)

### NE-1 — segnalazione duplicata = bug critico
Due segnalazioni in 28 minuti con identico testo significa che Alberto ha **provato di nuovo** sperando in un fix automatico, o sta dimostrando che il problema è ancora lì. È un urgenza implicita.

### NE-2 — il bottone 🐛 chat funziona dopo il fix mobile
La dev-request è arrivata correttamente con `type=bug_from_chat`, `sessionId`, `conversation`. Il fix CSS+JS del commit `17a47cb` (panel z-index 80 mobile, hide globalBtn quando chat aperta) sta funzionando in produzione.

### NE-3 — il fix è già descritto, manca l'implementazione
La proposta dettagliata è in `dev-analysis-hG2j9OqdEYTczLySpWmp.md`:
- Step 1 (M, ~60'): branch `byListName` con `where("stato","==","aperto").where("due",">=",fromIso).where("due","<",toIso)` sfruttando indice esistente `(stato, due)` su `bacheca_cards`
- Step 2 (S, ~30'): allargare `_isListInterventi` a `LETTURE`, `DA VALIDARE`, `OGGI`
- Step 3 (S): risposta raggruppata per listName
- Step 4 (M): allineare `byTecnico` con range data
- Step 5 (S): detect limit-hit warning
- Step 6 (S): test mirato

**Total effort: M (~2-3h)**.

## Proposta — riconferma + escalation di priorità

L'analisi `hG2j9OqdEYTczLySpWmp.md` resta valida senza modifiche. Cambia solo la priorità: **questa è una richiesta di implementazione, non più di analisi**. Il bug è confermato 2 volte in 28 minuti, nelle ore di lavoro di Alberto, su una funzionalità basilare ("interventi di oggi"). Va fixato subito con priorità sopra qualunque analisi pendente.

Step minimi per chiudere il bug (sotto-set della proposta originale):

### 1) Branch byListName con range data esplicito (M, critica)
**Dove:** `projects/iris/functions/handlers/ares.js:259-263`.
**Cosa fa:** quando c'è `range`, sfruttare l'indice esistente `(stato, due)`:

```js
if (range) {
  const fromIso = range.from.toISOString();
  const toIso   = range.to.toISOString();
  const promises = [];
  if (!includeTerminali) {
    promises.push(
      cosm.collection("bacheca_cards")
        .where("stato","==","aperto")
        .where("due",">=",fromIso)
        .where("due","<", toIso)
        .limit(500).get()
    );
  } else {
    promises.push(
      cosm.collection("bacheca_cards")
        .where("due",">=",fromIso)
        .where("due","<", toIso)
        .limit(500).get()
    );
  }
  const [snap] = await Promise.all(promises);
  stats.queries.push({q: `range ${range.label} stato=${includeTerminali?"any":"aperto"}`, count: snap.size});
  snap.forEach(d => docs.set(d.id, d));
}
```

L'indice composito `(stato, due)` è già dichiarato in `acg_suite/COSMINA/firebase/firestore.indexes.json:4-9`. Funziona out-of-the-box.

Per `due` come stringa ISO, il range string-compare funziona perché ISO 8601 è lessicograficamente ordinato.

### 2) Allargare `_isListInterventi` (S)
**Dove:** `ares.js:173-179`.
```js
function _isListInterventi(listName) {
  const ln = String(listName || "").toUpperCase();
  if (/INTERVENT/.test(ln)) return true;
  if (/ACCENSIONE|SPEGNIMENTO/.test(ln)) return true;
  if (/TICKET\s+DA\s+CHIUDER/.test(ln)) return true;
  if (/^LETTURE\b/.test(ln)) return true;
  if (/DA\s+VALIDARE/.test(ln)) return true;
  if (/^OGGI$/.test(ln)) return true;
  return false;
}
```

### 3) Risposta diagnostica (S)
Gruppo per `listName`:
> "Oggi 11 voci in agenda: 6 interventi aperti (David ×2, Marco, Antonio ×2, ...), 3 letture ripartitori (Lorenzo), 1 da validare (Victor)."

Step minimi: 1+2+3 = ~2 ore. Step 4-5-6 (allineamento `byTecnico` + warning + test) sono follow-up al primo deploy.

## Rischi e alternative

Stessi della scorsa analisi. Aggiungo:

### R6 — implementare al volo senza test rischia regression
La query nuova con `where("stato","==","aperto").where("due",...)` è più mirata MA usa un indice diverso. Verificare che gli stati abbiano valori esattamente `"aperto"` (lowercase) — schema bacheca_cards lo conferma (`stato: "aperto" | "chiuso" | ...`). OK.

### R7 — DRY_RUN attivo non impatta questa fix
Solo lettura, niente scritture. Nessun rischio di intervento spurio.

## Effort stimato

**Critico — M (~2 ore per step 1+2+3, deploy compreso)**.

| Step | Effort |
|---|---|
| 1) byListName con `where(stato).where(due range)` | M — 60' |
| 2) `_isListInterventi` allargato | S — 15' |
| 3) risposta raggruppata per listName | S — 30' |
| Test FORGE: "interventi di oggi" → trova 6+ aperti | S — 15' |
| Deploy + email + commit | S — 15' |

Tot: **2h max**. Fix ulteriori (step 4-6 dell'analisi originale) restano come follow-up dopo conferma di Alberto.

## Test di accettazione

1. **Caso reale**: "interventi di oggi?" → risposta tipo "Oggi 6 interventi aperti: David al privato ZZ000, Marco al Depretis, Antonio ×2 al Michelangelo/privato, ...".
2. **Includi chiusi**: "tutti gli interventi di oggi anche chiusi" → 7 INTERVENTI (incluso Federico Elite chiuso 06:51).
3. **Includi letture**: "interventi e letture oggi" → 9-10 voci raggruppate per listName.
4. **Regression**: "che interventi aveva Federico giovedì 23/04/2026?" → continua a trovare la card Via Toscanini Alessandria.
5. **Regression**: "interventi di Marco a Voghera" → 3 interventi.

## Nota operativa

Implementazione step 1+2+3 chiude il bug per Alberto. Resta da decidere se materializzare il task come `result: fix-ares-interventi-oggi` (segue la pipeline poller MAESTRO) o se Alberto lo richieda esplicitamente con un task message.
