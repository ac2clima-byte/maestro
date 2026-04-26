# Analisi Dev Request `trzc6usXBnlyv7SGPu04`

> Richiesta originale (Alberto, 2026-04-23):
> *"aggiungi un bottone blu in alto per segnalare un bug"*

---

## 1. Diagnosi — cosa succede oggi

Oggi nella PWA NEXO (`https://nexo-hub-15f2d.web.app`) **non c'è un bottone globale per segnalare bug**. L'unico ingresso esistente è dentro la pagina IRIS (`projects/nexo-pwa/public/iris/index.html`) come "Dev Request" associabile a un'email, ma:

- È nascosto dentro IRIS, non si vede dalla home né dalle altre pagine Colleghi.
- È pensato per richieste contestuali a un'email selezionata, non per "ho trovato un bug nella PWA".
- Non è visibile su mobile (la pagina IRIS è caricata in iframe e ha la sua UI).

Risultato: Alberto non ha un canale rapido e visibile per segnalare bug mentre usa la PWA → ha dovuto chiederlo via NEXUS chat (che lo ha materializzato in `nexo_dev_requests` con auto-id, doc `trzc6usXBnlyv7SGPu04`).

Il backend per ricevere queste segnalazioni è **già pronto e robusto**:
- collection `nexo_dev_requests` con regole Firestore già scritte (`projects/iris/firestore.rules:85-102`) che validano `description`, `status="pending"`, opzionale `emailRef`;
- MAESTRO ora pollerà questa collection ogni 2 minuti (`maestro.mjs` `pollDevRequests()` introdotta nel commit `e95986e`) e la trasforma in `tasks/dev-request-*.md`;
- Il bottone in IRIS scrive con questo identico shape (`projects/nexo-pwa/public/iris/index.html:2486-2512`).

Manca solo l'UI globale.

---

## 2. File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/nexo-pwa/public/index.html` | 49-53 (`.topbar`), 98-100 (`#nexusFab`), 102-130 (`#nexusPanel`) | Shell PWA: dove inserire il bottone "Segnala bug" e il modal |
| `projects/nexo-pwa/public/css/main.css` | 1-5 (palette `--acg-blue` `#006eb7`), 248-265 (`.topbar` mobile), 1034-1075 (`.nexus-fab`) | Stile bottone (deve usare `--acg-blue` come richiesto: "bottone blu") |
| `projects/nexo-pwa/public/js/app.js` | 38-49 (`getFirestore()` su `nexo-hub-15f2d`), 51-100 (`getAcgAuth()`), 268-274 (esempio uso `addDoc`/`collection`) | JS che monta il bottone, mostra il modal, fa `addDoc` su `nexo_dev_requests` |
| `projects/nexo-pwa/public/iris/index.html` | 2269 (`DEV_REQUESTS_COLLECTION`), 2486-2512 (shape payload + `addDoc`) | Riferimento per replicare esattamente lo stesso payload |
| `projects/iris/firestore.rules` | 85-102 (`match /nexo_dev_requests/{docId}`) | Rules: `description ≤ 4000`, `status == "pending"`, `emailRef` opzionale |

Nessun file di Cloud Function va toccato per questo task: `pollDevRequests` in MAESTRO già materializza i doc in `tasks/dev-request-*.md`.

---

## 3. Proposta — cosa cambiare e in che ordine

### 3.1 UI: bottone "Segnala bug" sempre visibile

**Posizione consigliata**: bottone fisso `position: fixed; top: 14px; right: 14px;` accanto agli altri elementi globali (FAB NEXUS è in basso-destra → niente collisione). In alternativa: dentro `.topbar` su mobile (che ora ha solo hamburger + titolo) e accanto a `#sidebarShowBtn` su desktop.

Preferisco il **fixed top-right su tutte le viewport** perché:
- "in alto" è esplicito nella richiesta;
- la `.topbar` esiste solo ≤ 760px (`main.css:258-262`), su desktop non c'è alcun "in alto" naturale;
- non disturba l'iframe IRIS che occupa il content;
- è coerente come pattern con il FAB NEXUS (entrambi flottanti).

**Markup proposto** (in `index.html`, vicino al FAB NEXUS):
```html
<button id="reportBugBtn" class="report-bug-btn" aria-label="Segnala un bug" title="Segnala un bug">
  <span aria-hidden="true">🐛</span>
  <span class="report-bug-label">Segnala bug</span>
</button>
```

**CSS** (in `main.css`, sezione "NEXUS chat" o nuova sezione "Report bug"):
```css
.report-bug-btn {
  position: fixed;
  top: 14px;
  right: 14px;
  background: var(--acg-blue);          /* "bottone blu" */
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  font-family: inherit;
  font-weight: 600;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 110, 183, 0.25);
  z-index: 70;                          /* sopra topbar e iframe */
  transition: transform 0.12s, background 0.12s;
}
.report-bug-btn:hover { background: var(--acg-blue-dark); transform: translateY(-1px); }
@media (max-width: 760px) {
  .report-bug-label { display: none; }   /* solo icona su mobile */
  .report-bug-btn { padding: 8px 10px; }
}
```

### 3.2 Modal "Segnala bug"

Modal semplice con: titolo, textarea (placeholder "Descrivi cosa non funziona…"), bottoni "Annulla" / "Invia".

Pattern consigliato: stesso usato in `iris/index.html:2486-2512`. In `app.js`:

```js
async function submitBugReport(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ok: false, error: "vuoto" };
  if (trimmed.length > 4000) return { ok: false, error: "troppo lungo" };
  const { db, fsMod } = await getFirestore();
  const me = currentUser?.email || null;
  const payload = {
    description: trimmed,
    status: "pending",
    source: "report_bug_btn",
    userId: me,
    createdAt: fsMod.serverTimestamp(),
    emailRef: null,           // shape compatibile con rules + IRIS
  };
  const ref = await fsMod.addDoc(fsMod.collection(db, "nexo_dev_requests"), payload);
  return { ok: true, id: ref.id };
}
```

UX dopo submit: toast "Segnalazione inviata. Claude Code la sta analizzando." e chiusura modal.

### 3.3 Ordine di implementazione

1. **CSS** (`main.css`): aggiungere blocco `.report-bug-btn` + `.report-bug-modal`. Zero impatti sul layout esistente.
2. **HTML** (`index.html`): aggiungere il bottone e il modal markup (markup hidden di default).
3. **JS** (`app.js`): wire bottone → apre modal; submit → `submitBugReport`; toast di conferma.
4. **Test manuale**: aprire la PWA, cliccare bottone, scrivere messaggio, verificare doc creato in `nexo_dev_requests`.
5. **Test E2E**: entro 2 minuti MAESTRO crea `tasks/dev-request-{id}.md` e Claude Code scrive l'analisi.

Nessun deploy backend richiesto. Solo `firebase deploy --only hosting --project nexo-hub-15f2d`.

---

## 4. Rischi e alternative

### Rischi

| Rischio | Mitigazione |
|---|---|
| Spam (utente clicca 100 volte) | Rate-limit lato client: disabilita bottone submit per 30s dopo invio; rules Firestore già limitano a `description ≤ 4000` |
| Bottone copre contenuto su mobile (ad es. l'header IRIS in iframe) | Nascondere label, lasciare solo icona; `top: 14px; right: 14px` non collide con hamburger (`top: 0; left: 0`) |
| Iframe IRIS sovrappone z-index | `z-index: 70` (sopra `.topbar` z-50) garantisce visibilità |
| Utente non autenticato vede il bottone ma submit fallisce | Mostrare il bottone solo dentro `#appRoot` (oltre l'auth gate). `display: none` finché auth non è completata, oppure `aria-hidden` + check in submit |
| Collisione con FAB NEXUS quando entrambi aperti | Nessuna: NEXUS è bottom-right, bug è top-right |

### Alternative considerate

- **Voce della sidebar**: aggiungere "Segnala bug" come item del menu. Meno visibile, ma più coerente col pattern colleghi. La richiesta dice "in alto" → la voce sidebar è "a sinistra", non rispetta la spec.
- **Integrazione in topbar mobile**: solo mobile, non risolve desktop.
- **Reuso del FAB NEXUS** con un menu contestuale (NEXUS chat / Segnala bug): nasconde la funzione dietro 2 click, peggiora la scopribilità.
- **Shortcut tastiera (es. Ctrl+B)**: comodo per power user ma il task chiede esplicitamente "bottone".

Conclusione: **bottone fisso top-right è la soluzione più aderente alla richiesta**.

---

## 5. Effort stimato — **S** (Small)

| Task | Tempo |
|---|---|
| CSS (.report-bug-btn + modal) | 15 min |
| HTML (bottone + markup modal) | 10 min |
| JS (open/close modal + submitBugReport + toast) | 30 min |
| Test manuale + E2E con MAESTRO | 15 min |
| `firebase deploy --only hosting` | 2 min |
| **Totale** | **~70 min** |

Un singolo file modificato per ognuno dei 3 livelli (HTML/CSS/JS), zero modifiche backend, zero rules da deployare. Il path E2E (PWA → Firestore → MAESTRO → Claude Code) è già stato validato dal flow Fase 0 + dal `pollDevRequests()` introdotto oggi.
