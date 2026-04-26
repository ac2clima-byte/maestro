# Analisi Dev Request `KbAuca5msDQaw0rD01ic`

> Richiesta originale (Alberto, 2026-04-26):
> *"mettiamo un tasto ARCHIVIA e un tasto ELIMINA per le mail"*

---

## 1. Diagnosi — cosa succede oggi

Nella pagina IRIS della PWA (`projects/nexo-pwa/public/iris/`) ogni email è renderizzata come **card** con 3 bottoni: `Leggi`, `Correggi`, `🛠️ Dev`. **Mancano** sia *Archivia* che *Elimina*. L'archiviazione esiste solo in due punti laterali:

- **Swipe-to-archive** sul widget digest della home (`app.js:365-477`): trascini la riga e parte l'archive. Funziona solo nel digest, non nelle card della pagina IRIS.
- **Bottone archive** dentro il digest (`app.js:480-...`): stesso flow, sempre limitato al widget home.

Backend dell'archivio è **già pronto**:
- `irisArchiveEmail` (`projects/iris/functions/index.js:1570-1592`): endpoint POST autenticato.
- `handleIrisArchiveEmail` (`projects/iris/functions/handlers/iris.js:219-256`): aggiunge un doc in `iris_archive_queue` e marca `iris_emails.{id}.status = "archived"` ottimisticamente.
- Il client wrapper c'è già (`app.js:457-478` `archiveEmailFromSwipe`), riusabile come funzione comune.

> ⚠️ **Gap noto fuori scope**: ho cercato il consumer di `iris_archive_queue` lato Hetzner. Il poller esistente (`scripts/iris_hetzner_poller.py`) fa solo fetch+classify, non legge la queue. La move EWS non avviene davvero. Il flag `archived` su `iris_emails` viene scritto comunque, quindi la UI sembra funzionare ma la cartella Outlook non cambia. Vale la pena annotarlo: la richiesta UI di Alberto comunque rispetta il contratto pre-esistente; l'eventuale fix del consumer è un task separato.

**Backend dell'eliminazione: NON esiste.** Non c'è alcun `irisDeleteEmail`, nessuna `iris_delete_queue`, nessuna voce di Eliminazione nel poller Hetzner. Bisogna progettarlo.

---

## 2. File coinvolti

### Frontend (PWA — IRIS)
| File | Righe | Ruolo |
|---|---|---|
| `projects/nexo-pwa/public/iris/index.html` | 1936-1965 (`renderEmailCard`) | Aggiungere markup bottoni "📦 Archivia" e "🗑️ Elimina" nella `.card-actions` |
| `projects/nexo-pwa/public/iris/index.html` | 1990-2018 (`renderEmails`) | Wireare i nuovi data-attribute (es. `data-archive`, `data-delete`) come per `data-read` / `data-correct` |
| `projects/nexo-pwa/public/iris/index.html` | 2080-2135 (rendering thread) | Stesso pattern nelle card thread (righe 2083-2085 hanno gli stessi 3 bottoni) |
| `projects/nexo-pwa/public/iris/index.html` | ~200 (CSS `.email-card`), ~1339 (CSS card mobile) | Stile dei due nuovi bottoni (riusare `.btn-link` o variante secondaria pericolosa per Elimina) |

### Frontend (PWA — wrapper riusabile)
| File | Righe | Ruolo |
|---|---|---|
| `projects/nexo-pwa/public/js/app.js` | 363 (`IRIS_ARCHIVE_URL`), 457-478 (`archiveEmailFromSwipe`) | Estrarre `archiveEmail(emailId)` come funzione esportata, usata sia da IRIS card sia dal digest. Aggiungere `IRIS_DELETE_URL` + `deleteEmail(emailId)` |
| `projects/nexo-pwa/public/js/app.js` | 67-77 (`getAuthIdToken`) | Già c'è, riusabile per le chiamate autenticate |

### Backend (Cloud Functions)
| File | Righe | Ruolo |
|---|---|---|
| `projects/iris/functions/handlers/iris.js` | 163-256 (archive handler) | Aggiungere `handleIrisDeleteEmail` con stesso pattern: scrivere su nuova `iris_delete_queue`, marcare `iris_emails.{id}.status = "deleted"` ottimisticamente |
| `projects/iris/functions/index.js` | 1564-1592 (export `irisArchiveEmail`) | Aggiungere export `irisDeleteEmail` (stesso shape: POST + auth + emailId) |
| `projects/iris/firestore.rules` | 20-23 (`iris_emails` write false), 279-... (`iris_archive_queue`) | Aggiungere `iris_delete_queue` con stesse rules dell'archive queue |

### Consumer EWS (Hetzner)
| File | Righe | Ruolo |
|---|---|---|
| `scripts/iris_hetzner_poller.py` | 1-25 (header) + nuova funzione | Aggiungere consumer per `iris_archive_queue` + `iris_delete_queue` con `exchangelib.Message.move()` / `.soft_delete()` |

> Per coerenza, lo scope della dev-request è **solo la UI**. Il consumer EWS è un task a parte che va annotato.

---

## 3. Proposta — cosa cambiare e in che ordine

### 3.1 Markup nei bottoni card (IRIS)

In `renderEmailCard` (riga 1957-1961), sostituire `.card-actions` con:

```html
<div class="card-actions">
  <button class="btn-link" data-read="${escapeHtml(e.id)}">Leggi</button>
  <button class="btn-link" data-correct="${escapeHtml(e.id)}">Correggi</button>
  <button class="btn-link" data-archive="${escapeHtml(e.id)}" title="Archivia in cartella per mittente">📦 Archivia</button>
  <button class="btn-link btn-danger" data-delete="${escapeHtml(e.id)}" title="Sposta nel cestino">🗑️ Elimina</button>
  <button class="btn-idea" data-idea="${escapeHtml(e.id)}" title="Apri una richiesta di sviluppo">🛠️ Dev</button>
</div>
```

Stesso identico cambio nella sezione thread (righe 2083-2085).

### 3.2 CSS

Aggiungere variante "danger" per Elimina (dovrà essere visivamente distinto):
```css
.btn-link.btn-danger { color: var(--err); }
.btn-link.btn-danger:hover { background: rgba(239,68,68,0.1); }
```

### 3.3 Wiring click

In `renderEmails` (righe 2009-2014) aggiungere accanto agli esistenti:
```js
$$("[data-archive]", list).forEach(btn => {
  btn.addEventListener("click", () => archiveEmailFromCard(btn.dataset.archive, btn));
});
$$("[data-delete]", list).forEach(btn => {
  btn.addEventListener("click", () => deleteEmailFromCard(btn.dataset.delete, btn));
});
```

Pattern UX consigliato (sia archive sia delete):
1. Disabilita il bottone, mostra stato "…"
2. Chiamata POST autenticata all'endpoint
3. **Conferma Elimina**: `confirm("Eliminare questa email? Verrà spostata nel cestino.")` — **non distruttivo**, EWS la mette in `Deleted Items` (recoverable)
4. Toast success/error
5. Animazione di rimozione card (fade-out 200ms) e refresh lista
6. In caso di errore: ripristina bottone, toast rosso

### 3.4 Backend — nuovo endpoint Elimina

In `handlers/iris.js` aggiungere:
```js
export async function handleIrisDeleteEmail(parametri) {
  const emailId = String(parametri.emailId || "").trim();
  if (!emailId) return { ok: false, error: "missing_emailId" };

  const docRef = db.collection("iris_emails").doc(emailId);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, error: "email_not_found" };

  const d = snap.data() || {};
  const raw = d.raw || {};
  const queueRef = db.collection("iris_delete_queue").doc();
  await queueRef.set({
    id: queueRef.id,
    emailId,
    messageId: raw.message_id || raw.ews_item_id || null,
    ewsItemId: raw.ews_item_id || null,
    sender: raw.sender || "",
    subject: raw.subject || "",
    mode: "soft",            // EWS soft_delete → Deleted Items folder
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await docRef.set({
    status: "deleted",
    eliminata_il: FieldValue.serverTimestamp(),
    deleteQueueId: queueRef.id,
  }, { merge: true });

  return { ok: true, queueId: queueRef.id, emailId };
}
```

In `index.js` aggiungere export `irisDeleteEmail` clonando `irisArchiveEmail` (stesso `cors:false`, `applyCorsOpen`, `verifyAcgIdToken`).

### 3.5 Rules

In `firestore.rules` accanto a `iris_archive_queue`, aggiungere:
```
match /iris_delete_queue/{docId} {
  allow read: if true;          // monitoring/debug
  allow write: if false;         // solo Admin SDK
}
```

### 3.6 Filtro UI

`applyFilters` (riga 1967) **non filtra** già `status: "archived" | "deleted"` perché il pattern attuale prevede che il poller marchi le email e la cache locale rimanga finché non si fa refresh. Per non far apparire le email archiviate/eliminate, aggiungere a `applyFilters`:
```js
filtered.filter(e => !["archived", "deleted"].includes(e.status))
```

### 3.7 Ordine di implementazione

1. **Backend** — aggiungere `handleIrisDeleteEmail` + export `irisDeleteEmail` + rule `iris_delete_queue`.
2. **Deploy backend** — `firebase deploy --only functions:irisDeleteEmail,firestore:rules --project nexo-hub-15f2d`.
3. **Frontend wrapper** — estrarre `archiveEmail(emailId)` riusabile da `app.js`, aggiungere `deleteEmail(emailId)`.
4. **Frontend UI** — bottoni in `renderEmailCard` (e thread), wire click, animazione rimozione card.
5. **Filtro lista** — escludere archived/deleted dal render.
6. **Deploy hosting** — `firebase deploy --only hosting --project nexo-hub-15f2d`.
7. **Test manuale** — cliccare Archivia → toast + card sparisce + doc `iris_emails` con `status="archived"`. Stesso per Elimina con `confirm`.
8. **Annotazione fuori scope** — apri dev-request separata "Hetzner consumer per archive/delete queue" perché il move EWS non avviene davvero.

---

## 4. Rischi e alternative

### Rischi

| Rischio | Mitigazione |
|---|---|
| Click accidentale su Elimina = perdita email | `confirm()` JS prima della chiamata + soft-delete EWS (Deleted Items, recoverable) + flag `mode: "soft"` nella queue |
| Backend marca `status="archived"` ma il move EWS non avviene (gap consumer) | Documentare nella PR; il flag in Firestore è ottimistico ma ricorda di alzare la priority del consumer Hetzner |
| Doppi bottoni nella card su mobile sforano la larghezza | CSS responsive: su mobile (`@media max-width 760px`) accorciare a icone (`📦` / `🗑️`) senza testo |
| Permessi: utenti diversi possono eliminarsi email l'uno con l'altro? | Per ora `verifyAcgIdToken` accetta qualsiasi utente ACG. Se serve granularità, aggiungere ACL su `iris_emails.assignedTo` o simile (futuro) |
| Filtro lista nasconde email archiviate ma il backend non le rimuove dalla cache | Aggiungere bottone "Mostra archiviate" + badge su email `status="archived"` invece del filtro hard, scelta UX da confermare |
| Conflitto con swipe-to-archive sul digest | Nessuno: il digest usa la stessa funzione `archiveEmail`, anzi guadagna coerenza |

### Alternative considerate

- **Solo Archivia, niente Elimina**: copre l'80% dei casi (Alberto archivia per mittente). Ma la richiesta dice esplicitamente "ELIMINA", quindi va incluso.
- **Soft-delete logico solo Firestore (no EWS)**: marcare `iris_emails.deleted=true` senza toccare EWS. Vantaggio: zero dipendenza da Hetzner. Svantaggio: l'email resta nell'inbox Outlook, l'utente la rivede dal client desktop e si confonde.
- **Hard delete EWS (non soft)**: rischio perdita irrecuperabile. Scartato.
- **Bottone di azione contestuale (menu kebab)** invece di bottoni inline: più pulito visivamente ma 1 click in più. Preferisco bottoni inline visibili, coerenti con `Leggi/Correggi/Dev`.
- **Multi-select + bulk action**: utile per cleanup ma fuori scope. Annotabile come dev-request successiva.

---

## 5. Effort stimato — **M** (Medium)

| Task | Tempo |
|---|---|
| Backend: `handleIrisDeleteEmail` + export | 30 min |
| Rules per `iris_delete_queue` + deploy | 10 min |
| Frontend: bottoni in card + thread + CSS | 30 min |
| Wrapper riusabili `archiveEmail` / `deleteEmail` in `app.js` | 20 min |
| Wiring click + animazione rimozione + filtro lista | 30 min |
| Test manuale (archive ok, delete con confirm, refresh, refresh thread) | 20 min |
| Deploy hosting + smoke test | 10 min |
| **Totale** | **~150 min** (2.5 ore) |

L'effort è **M** invece di **S** perché:
- richiede un nuovo endpoint backend (con relativa rule, deploy, test);
- tocca 2 layer (Cloud Function + PWA + rules) vs 1 della dev-request precedente;
- il pattern soft-delete richiede attenzione per evitare side-effect spiacevoli in caso di gap del consumer Hetzner.

Non scenderei sotto **M** anche se l'archive backend è già pronto: la parità Archivia/Elimina implica che entrambi devono funzionare end-to-end o nessuno dei due (altrimenti UX incoerente).
