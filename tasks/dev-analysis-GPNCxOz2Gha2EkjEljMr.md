# Analisi dev-request GPNCxOz2Gha2EkjEljMr

**Origine:** bottone 🐛 dentro la chat NEXUS (`source: nexus_chat_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** `nx_tc95btk3moh3u929`
**Data:** 2026-04-27 11:19 UTC
**Type:** `bug_from_chat`
**Nota di Alberto:** (nessuna)

## Conversazione segnalata

| ts | ruolo | content |
|---|---|---|
| 11:19:31 | ALBERTO | "interventi di Marco oggi" |
| 11:19:36 | NEXUS | "Marco oggi non ha interventi (cercato: 334 card totali, filtro data oggi, solo aperti)." |

## ⚠️ CORREZIONE — verifica approfondita (NEXUS aveva torto)

> La mia analisi iniziale concludeva "Marco oggi non ha interventi → NEXUS
> ha ragione". **Era sbagliato.** Una verifica più approfondita ha trovato
> il vero bug, descritto in fondo (sezione "## Bug F — labels[] ignorato").
> La sezione "Verifica dei dati reali" qui sotto resta come riferimento
> ma la conclusione era errata: rileggere fino in fondo.

## Verifica dei dati reali (Europe/Rome 27/04/2026)

Ho replicato la query handler ARES su `bacheca_cards` (`garbymobile-f89ac`):

```
byTecnico q1 (techName=="MARCO"):           328 card
byTecnico q2 (techNames array-contains MARCO): 333 card
totali Marco unique:                         334 card
con listName interventi-like:                221 card
con due nel range "oggi italiano" (26/04 22:00Z ↔ 27/04 22:00Z): 0
```

E facendo scan su tutta `bacheca_cards` (25.780 card) per **qualsiasi** card del 27/04 (non filtrato per Marco), trovo 11 card **distribuite tra altri tecnici**:

```
LORENZO  ×4  (3 LETTURE RIP, 1 INTERVENTI riqualificazione Depretis)
DAVID    ×2  (interventi privati ZZ000 - "DARE BIANCO IN VIA TOSCANINI")
ANTONIO  ×2  (Michelangelo, ZZ000)
FEDERICO ×1  (Elite Voghera, chiuso 06:51)
VICTOR   ×1  (Giardino 3, RITORNO NON URGENTE)
ERGEST   ×1  (Hembassy, tinteggiatura box)
MARCO    ×0  ← non assegnato a nessuna card di oggi
```

**Estendendo la ricerca a name/desc/workDescription/boardName** (non solo techName/techNames), nessuna card di oggi cita "marco" né "piparo".

**Conclusione tecnica**: la risposta di NEXUS è **fattualmente corretta**. Marco oggi non ha card di intervento assegnate a sé (né come primario né come co-assegnato). L'unica modifica recente notevole: la card del Depretis del 27/04, che alle 08:25 di stamani aveva `techName="MARCO"`, ora ha `techName="LORENZO"` — è stata riassegnata da Marco a Lorenzo prima delle 11:19.

## Diagnosi — perché Alberto pensa sia un bug

L'utente fa una domanda di routine ma riceve una risposta che **suona inaspettata** per lui. Tre cause UX:

### Bug A — "334 card totali" è ambiguo e fuorviante
La frase "(cercato: 334 card totali, filtro data oggi, solo aperti)" si riferisce alle 334 card di Marco _in totale_ (su tutta la bacheca, non solo oggi). Alberto può leggere **erroneamente** "oggi ho letto 334 card" e pensare:
- "OK, ha effettivamente cercato in tutta la bacheca";
- oppure "ma se ne ha lette 334, almeno una doveva esserci di Marco oggi".

In realtà 334 = totale storico di Marco. La diagnostica è poco informativa.

### Bug B — la risposta non distingue tra "0 nella tua query" e "nessuno tecnico oggi"
Alberto chiede di Marco e riceve "Marco oggi non ha interventi". Nulla gli dice che:
- gli altri tecnici **invece sì** (ne hanno 11 in totale);
- la card che era di Marco è stata **riassegnata** (il Depretis, ex-Marco → Lorenzo).

Alberto dovrebbe poter sapere "Marco non ha card, ma il lavoro su Depretis che lui aveva è passato a Lorenzo".

### Bug C — assenza di riferimento alla riassegnazione recente
Spiegazione probabile della frustrazione: Alberto **ricorda** che stamattina presto (forse alle 08-09) aveva assegnato/visto Marco al Depretis per oggi. Poi qualcuno ha cambiato (Lorenzo). NEXUS non ha alcuna nozione di **modifiche recenti**: legge solo lo stato corrente. Se `updated_at` è recente vale la pena suggerire "Questa card è stata modificata oggi alle 09:30".

### Bug D — niente proposta di domande adiacenti
Quando il sistema ritorna 0 risultati, dovrebbe proporre alternative naturali:
- "Marco oggi non ha card. Vuoi che ti dica chi lavora oggi?"
- "Vuoi i prossimi interventi di Marco questa settimana?"
- "Cerco anche tra i co-assegnati e i ticket?"

### Bug E — campo `oggi` ambiguo per l'utente
"interventi di Marco oggi" può significare:
- Card con `due=27/04` (interpretazione attuale, corretta).
- Card su cui Marco lavora effettivamente oggi (eg. card aperte ancora "in mano" a Marco anche se `due` è precedente).
- Card che oggi sono in agenda Marco (cosa che non c'è in `bacheca_cards`, sta su `agendaActivities` collection).

NEXUS interpreta solo (1). Per Alberto le altre potrebbero essere rilevanti.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/ares.js` | 220-260 | branch byTecnico — query parallela techName + techNames array-contains |
| `projects/iris/functions/handlers/ares.js` | 280-320 | filtro client-side data + listName + stato |
| `projects/iris/functions/handlers/ares.js` | ~360-410 | render risposta vuota — formato attuale "Marco oggi non ha interventi (cercato: N card totali, ...)" |
| `context/memo-firestore-garbymobile.md` | 215-228 | schema bacheca_cards — campi `updated_at`, `closedAt` per tracciare modifiche |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Riformulare la diagnostica "0 risultati" (S, alta priorità)
**Dove:** `ares.js`, branch render quando `top.length === 0` con tecnicoFilter presente.
**Cosa fa:** sostituire il messaggio attuale con uno più chiaro e contestuale:

```js
if (!top.length && tecnicoFilter && range) {
  const tecnicoCap = tecnicoFilter.charAt(0).toUpperCase() + tecnicoFilter.slice(1);
  // Conta quanti interventi totali oggi (per altri tecnici) per dare contesto
  let totalToday = 0;
  // ... query rapida senza filtro tecnico nel range data ...

  let parts = [`${tecnicoCap} ${range.label} non ha interventi assegnati`];
  if (totalToday > 0) {
    parts.push(`oggi in totale ci sono ${totalToday} interventi sulla bacheca, distribuiti tra altri tecnici`);
  }
  parts.push(`(${stats.queries.map(q => q.count).reduce((a,b)=>a+b,0)} card di ${tecnicoCap} viste in totale)`);
  return {
    content: parts.join('. ') + '.',
    suggestions: [
      `chi lavora ${range.label}?`,
      `prossimi interventi di ${tecnicoCap}`,
      `interventi di ${tecnicoCap} questa settimana`,
    ],
  };
}
```

Risposta target:
> "Marco oggi non ha interventi assegnati. Oggi in totale ci sono 11 interventi sulla bacheca, distribuiti tra altri tecnici (Lorenzo, David, Antonio, Federico, Victor, Ergest). Ho controllato 334 card di Marco. Vuoi sapere chi lavora oggi, o i prossimi interventi di Marco?"

### 2) Tracciare riassegnazioni recenti (M)
**Dove:** `ares.js`, dentro `handleAresInterventiAperti`.
**Cosa fa:** quando l'utente chiede "interventi di [Tecnico] oggi" e il risultato è 0, fai una **query secondaria**: cerca card del giorno odierno con `updated_at > daysAgo(2)` (modificate negli ultimi 2 giorni) E `techName` o `techNames` precedentemente nominava il tecnico richiesto. Se trovi: avvisa "Una card che era assegnata a Marco è stata riassegnata a Lorenzo ieri/oggi alle XX:XX".

**Implementazione semplice**: leggi tutte le card di oggi (range data) ordinate per `updated_at desc`. Per ciascuna controlla se `techName` corrente NON è il tecnico richiesto MA il `name`/`desc` o un campo `previousTechName` (se esiste) lo cita.

Più solido: chiedere a backend (Trello sync di COSMINA) di tenere uno **storico delle assegnazioni**. Outside scope della cloud function, ma esiste già il listener Trello. Se l'history è in `trello_audit_log`, possiamo cercare lì.

### 3) Estensione: agenda effettiva oltre bacheca_cards (M-L, follow-up)
**Dove:** nuovo handler `handleAresAgendaTecnico` o estensione di `handleAresInterventiAperti`.
**Cosa fa:** quando si chiede "interventi di [Tecnico] oggi", cercare anche in:
- `agendaActivities` (altra collection 370 doc del memo Firestore) — attività agenda non intervento.
- `chronos_planning` — pianificazione interventi futura.
- Stato `slot_tecnico` (CHRONOS) per giornata.

Mostrare: "Sulla bacheca interventi 0. Sull'agenda 2 attività (visite tecniche, sopralluoghi). Vuoi vedere?".

### 4) Proporre azioni (S)
**Dove:** risposta NEXUS (formato content).
**Cosa fa:** quando 0 risultati con filtro tecnico, aggiungere 1-2 domande proattive in italiano naturale:
- "Vuoi che ti dica chi lavora oggi?"
- "Cerco i prossimi interventi di Marco?"

NB: rispetta la regola NEXUS Chat (no bullet, no formato robot).

### 5) Audit log delle riassegnazioni (L, follow-up futuro)
**Dove:** trigger Firestore su `bacheca_cards` (Cloud Function on-update).
**Cosa fa:** quando una card cambia `techName`, scrive un record in `bacheca_cards_history` con: cardId, oldTechName, newTechName, timestamp, source. Permette risposte tipo "questa card era di Marco, è passata a Lorenzo alle 09:15 di oggi".

Out of scope di questo fix immediato. Da pianificare separatamente.

## Rischi e alternative

### R1 — Query secondaria per "interventi totali oggi" aumenta latenza
Una seconda query Firestore (no filtro tecnico, solo range data) costa ~300-500ms. Mitigazione: usare `where("due",">=",fromIso).where("due","<",toIso).limit(50)` con indice esistente — gestibile.

### R2 — "Suggerimenti azioni" può degradare UX se troppi
Se Alberto si abitua a vedere sempre 2-3 suggerimenti, può diventare rumore. Mitigazione: solo quando `count === 0` e c'è un filtro specifico, NON quando 0 risultati con query generica.

### R3 — Tracciare riassegnazioni richiede storico
Senza history non possiamo davvero dire "era assegnata a Marco". Soluzione minima: usare `updated_at` come segnale ("questa card è stata modificata oggi alle XX, magari di recente le assegnazioni sono cambiate"). Più completo richiede listener Trello sync.

### R4 — Falso "Alberto è in errore"
Nel caso reale **NEXUS ha ragione**. Una risposta più informativa riduce frustrazione, ma la sostanza ("Marco oggi non ha interventi") resta. Va verificato con Alberto se questa è una sua aspettativa errata o un'interfaccia che non lo informa abbastanza.

### Alternative scartate

- **A1: chiedere ad Alberto "in che giorno e ora aveva visto Marco assegnato?"** — UX peggiore.
- **A2: query a CHRONOS/agenda per arricchire** — utile ma fuori scope dell'attuale handler. Pianificabile come step 3 separato.
- **A3: log delle modifiche negli ultimi 24h** — bello ma richiede infrastruttura nuova.

## Effort stimato

**Totale: S-M (small-medium)** — 60-90 minuti per i fix UX core.

| Step | Effort |
|---|---|
| 1) riformulare diagnostica con "totali oggi tra altri tecnici" | S — 30' |
| 2) tracciare card di oggi modificate di recente | M — 45' |
| 3) cross-search in agendaActivities | M — 60' (separato) |
| 4) suggerimenti proattivi | S — 15' |
| 5) audit log riassegnazioni | L — 3-5h (separato, infra) |
| Test FORGE: "interventi di Marco oggi" → risposta arricchita | S — 15' |
| Deploy + email + commit | S — 15' |

Senza step 3 e 5: ~**2 ore**.

## Test di accettazione

1. **Caso reale di Alberto**: "interventi di Marco oggi" → "Marco oggi non ha interventi assegnati. In totale oggi 11 interventi sulla bacheca: 4 a Lorenzo, 2 David, 2 Antonio, 1 a testa per Federico/Victor/Ergest. Vuoi che ti dica chi va al Depretis?"
2. **Riassegnazione tracciata**: se possibile, "L'intervento Depretis di oggi è ora di Lorenzo (era stato assegnato a Marco fino a stamattina)".
3. **Regression** "interventi di Federico venerdì" → trova card Via Toscanini, no break.
4. **Regression** "interventi di oggi" senza tecnico → trova 11 (post-fix listName).

## Bug F — labels[] IGNORATO (causa primaria reale)

**Verifica approfondita su `bacheca_cards/card_1777270881517_nqyeldr1t`**:
```
listName: INTERVENTI
due:      2026-04-27T12:00:00.000Z   ← oggi italiano alle 14:00
stato:    aperto
techName: "LORENZO"          (primario)
techNames: ["LORENZO"]       (solo Lorenzo)
labels: [
  {"name":"LORENZO","color":"sky"},
  {"name":"MARCO","color":"sky"},     ← Marco è qui!
  {"name":"MATTINO","color":"yellow"}
]
boardName: G033 - CONDOMINIO DEPRETIS - VIA SANT'AMBROGIO 17 - VOGHERA (PV)
name: RIQUALIFICAZIONE
```

ACG **assegna i co-tecnici via `labels[]`** quando 2 tecnici lavorano insieme. Lorenzo è il primario (chi chiude la card), Marco è co-coinvolto. Il mio handler ARES legge solo `techName`+`techNames[]` e **ignora completamente `labels[]`**. La card Depretis di oggi NON viene mai associata a Marco nelle query.

**Quanto è frequente questo pattern?** Su 5.000 card scansionate:
- 279 card (5.6%) hanno un nome tecnico ACG in `labels[]`
- **222 di queste** (80% delle card label-tecnico) hanno tecnici in label che **NON sono in techName/techNames**

Significa che il modello "MEMO dovrebbe sapere cosa è un'assegnazione" oggi è incompleto: l'handler lo limita a `techName`+`techNames[]` ma la realtà ACG include anche `labels[]`. Sono ~220 card sistematicamente non recuperate da query "interventi di [Tecnico]".

### Definizione corretta di "tecnico assegnato a una card" su `bacheca_cards`

(da centralizzare in `MEMO` / `shared.js` / context memo Firestore):

```
Un tecnico T è ASSEGNATO a una card se vale ALMENO UNO dei seguenti:
  1. card.techName === T (case-insensitive uppercase, primario)
  2. T ∈ card.techNames[]  (case-insensitive uppercase, co-primari)
  3. card.labels[].name === T  (case-insensitive uppercase, label co-coinvolto)

In tutti e tre i casi, T DEVE comparire nei risultati di "interventi di T".
```

### Fix proposto (S, alta priorità)

**Dove:** `ares.js:_allTechs` (centralizza la logica) + query Firestore.

```js
function _allTechs(data) {
  const seen = new Set();
  const out = [];
  const add = (t) => {
    const s = String(t || "").trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  add(data.techName);
  if (Array.isArray(data.techNames)) for (const t of data.techNames) add(t);
  // FIX: anche labels[] sono assegnazioni in ACG (co-tecnici). Esclude
  // labels colore/etichetta (MATTINO, POMERIGGIO, URGENTE, ...) che
  // non sono nomi di tecnici.
  if (Array.isArray(data.labels)) {
    for (const l of data.labels) {
      const nm = String(l && l.name || "").trim();
      if (nm && TECNICI_ACG_UPPER.includes(nm.toUpperCase())) add(nm);
    }
  }
  return out;
}
```

E nella query Firestore: aggiungi una terza query `where("labels", "array-contains", { name: tecnicoUpper, color: "sky" })` — **ma** Firestore non supporta `array-contains` su oggetti con shape complessa senza match esatto. Soluzione pratica: dopo le 2 query parallele esistenti (`techName==X`, `techNames array-contains X`), fai una **terza query** che filtra in memoria sui risultati `byListName` o estende la lettura.

Fix più robusto: leggere SEMPRE le card del range data + filtrare in memoria su `_allTechs(data)`. Ovvero abbandonare il branch `byTecnico` Firestore-side e usare sempre il branch `byListName` con range data come query primaria, poi filtrare in memoria. Costa ~50 read in più per query ma risolve definitivamente.

### Verifica fix attesa

"interventi di Marco oggi" → trova:
- card_1777270881517_nqyeldr1t (Depretis, Lorenzo+Marco label)
- (eventuali altre con Marco in label oggi — verificare)

E per i giorni successivi 28-30/04 trova le ~30+ card di Marco (LETTURE RIP) che oggi già funzionano (techName="MARCO"), senza regressioni.

## Nota operativa — risposta ad Alberto

> "MEMO dovrebbe sapere cosa significa assegnare un intervento ad un
> tecnico, non serve andare a rivedere la logica ogni volta altrimenti
> è inutile."

Hai ragione e la mia analisi precedente era inadeguata: avevo concluso "NEXUS ha ragione" basandomi su una definizione TROPPO RISTRETTA di "assegnato" (solo `techName`/`techNames[]`). La definizione corretta in ACG include anche `labels[]` con nome tecnico.

**Action items per centralizzare**:
1. **`shared.js`**: spostare `_allTechs` in `shared.js` come `tecniciAssegnatiCard(card)` esportata. Diventa la fonte unica di verità.
2. **`context/memo-firestore-garbymobile.md`**: aggiungere nello schema `bacheca_cards` la definizione "tecnici assegnati = techName ∪ techNames[] ∪ labels[].name (filtrati su whitelist)".
3. **`CLAUDE.md`**: aggiungere regola "Per qualsiasi handler che cerca interventi per tecnico, usare `tecniciAssegnatiCard()` da `shared.js`. Non reimplementare la logica."

Il fix richiede modifica codice — non solo analisi. Effort **S** (~30 min):
- helper centrale + import in ares.js
- estensione query (terza query labels o shift a byListName con range)
- test FORGE: "interventi di Marco oggi" → trova Depretis
- update memo + CLAUDE.md
- deploy + commit "feat(memo): tecnici assegnati include labels"

Resto a disposizione per implementare se lo richiedi.
