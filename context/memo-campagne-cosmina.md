# MEMO — Campagne COSMINA (struttura dati)

> **Responsabile:** MEMO
> **Project:** `garbymobile-f89ac`
> **Scansione:** 2026-04-23
> **Script:** `scripts/memo_scan_campagne.py` · export `scripts/memo_scan_campagne.json`

---

## 1. Collection

| Collection | Docs | Ruolo |
|---|---:|---|
| **`cosmina_campagne`** | 5 (aperte + archiviate) | **Anagrafica campagna** (nome, date, stato) |
| `cosmina_campagne_reports` | 21 | Storico report DOCX generati (riferimenti a `campagna_id`) |
| **`bacheca_cards`** | 25.633 | **Interventi operativi** — hanno campo `campagna_id` + `campagna_nome` quando appartengono a una campagna |
| `campaigns` | 0 | vuota (legacy) |

## 2. Schema `cosmina_campagne`

```
{
  nome: "Letture WalkBy ACG FS 2026"
  stato: "aperta" | "archiviata"
  archiviata: bool   (flag duplicato in alcuni doc)
  data_inizio: string | null
  data_fine:   string | null
  descrizione: string | null
  descrizione_dettagliata: string | null
  source: string | null        // es. "campagna_spegnimento_2026"
  tags: list<string>
  allegati: list
  created_by: string | null
  data_creazione: timestamp
  updated_at: timestamp
}
```

### Campagne attive al 2026-04-23 (scan full)

| ID | Nome | Stato | Interventi collegati (bacheca) |
|---|---|---|---:|
| `HOfoujtlWfjG98vUzuce` | RIEMPIMENTI 2026 | aperta | 0 |
| `LCBslH0DXV4zSS5g9QX2` | CAMBIO ORA S/L 2026 | archiviata | — |
| `Ydf7oofX8wiLn2aXx6gE` | POSTELEGRAFONICI - CAMBIO CONTATORI | aperta | — |
| `ii71EmdulREsosfsmoFV` | SPEGNIMENTO 2026 | aperta | **39** |
| `jfth09On9jXtbs9ymrIM` | SVUOTAMENTI 2026 | aperta | 0 |
| *(non in cosmina_campagne ma usata in bacheca)* | **Letture WalkBy ACG FS 2026** | — | **97** |
| *(idem)* | **Letture WalkBy GZT FS 2026** | — | **13** |

⚠️ **Nota importante**: le campagne WalkBy **non esistono in `cosmina_campagne`** — vengono referenziate solo tramite `campagna_nome` nei doc `bacheca_cards`. La lista "campagne reali" va quindi costruita **unione** tra le 5 docs di `cosmina_campagne` e le `campagna_nome` distinte osservate in `bacheca_cards`.

## 3. Schema `bacheca_cards` (card di una campagna)

Campi chiave quando `campagna_id` è popolato:

```
{
  _id: "0p5qxTCc2RsKDcxX7oov"              // Firestore doc ID
  originalCardId: "..."                    // Trello card ID
  originalBoardId: "..."
  crm_id: "T059"                           // FK verso crm_clienti
  boardName: "T059 - BRONI - CENTRO CREMASCHI..."

  // ── Campi campagna ──
  campagna_id: "n0Mabyfp5fZjfIsMqHfB"      // FK (ma non sempre in cosmina_campagne!)
  campagna_nome: "Letture WalkBy ACG FS 2026"
  source: "import_letture_walkby_2026"     // batch import che l'ha creata

  // ── Intervento ──
  name: "LETTURE RIPARTITORI GIACOMINI"
  listName: "LETTURE RIP"                  // lista Trello (tipologia)
  stato: "aperto"                          // UNIFORME: tutti i walkby sono "aperto" (non usato)
  archiviato: false
  inBacheca: true

  due: "2026-05-06T09:00:00+02:00"         // data prevista (può mancare)
  created_at: timestamp
  updated_at: timestamp
  dateLastActivity: timestamp

  // ── Tecnico ──
  techName: "MARCO"                        // tecnico principale
  techNames: ["MARCO"]                     // array (primary + altri)
  techSyncedAt: timestamp

  // ── Labels (SEMANTICHE!) ──
  labels: [
    { name: "MARCO", ... },
    { name: "PROGRAMMATO", ... }           // ⭐ usato come stato effettivo
  ]

  desc: "..."
  customFieldItems: [...]
}
```

## 4. Come distinguere gli stati (⭐ critico per la dashboard)

Il campo `stato` è **uniforme "aperto"** su tutti i walkby — non serve. Gli stati si ricavano da una combinazione di:

| Stato derivato | Regola |
|---|---|
| **Completato** | `archiviato: true` OR `labels contiene "COMPLETATO"` OR `labels contiene "FATTO"` OR `inBacheca: false` |
| **Scaduto** | `due` presente AND `due < now` AND NON completato |
| **Programmato** | `labels contiene "PROGRAMMATO"` AND `due >= now` AND NON completato |
| **Da Programmare** | `due is null` AND NON completato AND NON "DA NON FARE" AND NON "NON FATTO" |
| **Non Fatto** | `labels contiene "NON FATTO"` |
| **Da Non Fare** | `labels contiene "DA NON FARE"` OR `labels contiene "NON DA FARE"` |

Ordine di valutazione (first-match-wins):
1. `Da Non Fare` → skip
2. `Non Fatto` → conteggia
3. `Completato` → conteggia
4. `Scaduto` (se ha due scaduta) → conteggia
5. `Programmato` (se ha due futura) → conteggia
6. Altrimenti `Da Programmare`

### Metriche campagna "Letture WalkBy ACG FS 2026" (scan full 2026-04-23)

- **Totale**: 97
- Con label `PROGRAMMATO`: 50 (con due futura)
- Senza label: 47 (da programmare)
- Assegnati a MARCO: 84
- Senza tecnico: 26 (tutti da sistemare)
- Stati reali `completato`/`scaduto`: 0 al momento (campagna ancora futura, inizia 2026-05-06)

## 5. Relazioni

```
cosmina_campagne (id)
      ▲
      │ campagna_id
      │
bacheca_cards (campagna_id, campagna_nome)
      │
      │ crm_id
      ▼
crm_clienti (codice A001, U058, etc.)
      │
      │ boardId / board_name
      ▼
trello_boards (sync)
```

## 6. Source field

Il campo `source` in bacheca_cards rivela come è stata creata la card:
- `import_letture_walkby_2026` — batch import walkby
- `campagna_spegnimento_2026` — spegnimento
- `cosmina_email` — da email automatica
- `nexus_ares` — creata via NEXUS (handleAresApriIntervento)

Utile per audit delle origini.

## 7. Note operative

1. **Duplicazione campagne**: le campagne WalkBy non sono in `cosmina_campagne`. Possibile debito tecnico — creare un sync automatico.
2. **Label "PROGRAMMATO" vs date**: alcune card hanno `due` ma non la label "PROGRAMMATO" (5 walkby su 15 nel primo sample). Serve OR.
3. **ListName vs Campagna**: `LETTURE RIP` è la lista Trello, NON la campagna. Per il filtering usare sempre `campagna_nome` o `campagna_id`.
4. **crm_id ≠ campagna_id**: `crm_id` è il codice cliente (T059), `campagna_id` è UUID-like.

---

## 8. Query per CHRONOS handler

```js
// Lista campagne: unione cosmina_campagne + nomi distinti bacheca_cards
async function getCampagneAttive() {
  const [cSnap, bSnap] = await Promise.all([
    db.collection("cosmina_campagne").get(),
    db.collection("bacheca_cards").where("listName", "in",
      ["LETTURE RIP", "INTERVENTI", ...]).limit(3000).get(),
  ]);
  const campagne = new Map();
  cSnap.forEach(d => {
    const v = d.data() || {};
    campagne.set(v.nome, { id: d.id, ...v, source: "cosmina_campagne", count: 0 });
  });
  bSnap.forEach(d => {
    const v = d.data() || {};
    if (!v.campagna_nome) return;
    if (!campagne.has(v.campagna_nome)) {
      campagne.set(v.campagna_nome, {
        id: v.campagna_id, nome: v.campagna_nome,
        source: "bacheca_inferred", count: 0,
      });
    }
    campagne.get(v.campagna_nome).count++;
  });
  return Array.from(campagne.values());
}

// Metriche single campagna
function classifyCard(card) {
  const labels = (card.labels || []).map(l =>
    (typeof l === "object" ? l.name : l) || ""
  ).map(s => s.toUpperCase());
  if (labels.includes("DA NON FARE") || labels.includes("NON DA FARE"))
    return "da_non_fare";
  if (labels.includes("NON FATTO")) return "non_fatto";
  if (card.archiviato === true || labels.includes("COMPLETATO") ||
      labels.includes("FATTO") || card.inBacheca === false)
    return "completato";
  const due = card.due ? new Date(
    card.due.toDate ? card.due.toDate() : card.due
  ) : null;
  const now = new Date();
  if (due && due < now) return "scaduto";
  if (due) return "programmato";
  return "da_programmare";
}
```
