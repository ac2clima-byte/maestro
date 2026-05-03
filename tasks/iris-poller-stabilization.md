# IRIS poller stabilization — riavvio + 60s + onSnapshot PWA

## Contesto

Alberto segnala via NEXUS chat: "quando arriva una mail e la vedo su outlook
perché non appare subito su iris?"

L'analisi completa è in `tasks/dev-analysis-zYNnGZA2qKiHgEo5ZrsV.md`.
Riassunto: il poller IRIS gira come script locale sul WSL di Alberto
(perché Cloud Functions non possono raggiungere Exchange on-prem) e
**è fermo da più di 24 ore**. Risultato: nuove email non appaiono.

Questo task implementa il pacchetto `(NOW + oggi)` dell'analisi:
3.1 (riavvio + heartbeat), 3.2 (POLL_INTERVAL 60s), 3.5 (onSnapshot PWA).

Effort stimato: 1-2 ore. Latenza percepita: da "ore di silenzio" a "30-60s".

## Cosa fare

### Step 1 — Riavvia il poller (immediato)

```bash
ls ~/iris-local-poller* 2>/dev/null
ls projects/iris/scripts/iris_local_poller.sh 2>/dev/null
ps aux | grep -E "(iris.*poll|pipeline\.py)" | grep -v grep
```

Se il poller non sta girando, riavvialo. Lo script di start dovrebbe essere:

```bash
projects/iris/scripts/start-iris-poller.sh
```

oppure:

```bash
nohup bash projects/iris/scripts/iris_local_poller.sh > /tmp/iris-poller.log 2>&1 &
```

Verifica che parta con:

```bash
tail -f /tmp/iris-poller.log
# oppure il logfile vero, vedi nello script
```

Devi vedere log tipo "Polling EWS...", "Email N classificata...", "Scritto su Firestore...".

Aspetta 2 minuti e verifica su Firestore (`iris_emails`) che ci siano
documenti con `createdAt` recente.

### Step 2 — Riduci POLL_INTERVAL a 60s

Trova il valore attuale (probabilmente 300s o simile):

```bash
grep -rn "POLL_INTERVAL\|poll_interval\|sleep [0-9]" projects/iris/scripts/
```

Modifica il file dove è definito (probabilmente `iris_local_poller.sh` o
`pipeline.py`). Cambia il valore a **60 secondi**.

```diff
-POLL_INTERVAL=300
+POLL_INTERVAL=60
```

Salva, riavvia il poller, verifica nei log che il ciclo sia ora di 60s.

**Nota costi**: con 5-10 email nuove/giorno, passare da 5min a 60s aumenta
le chiamate Haiku trascurabilmente (1-2$/mese, già stimato in analisi).

### Step 3 — onSnapshot real-time in PWA IRIS

Il file PWA è `projects/iris/pwa/index.html` (verifica path effettivo;
l'analisi cita `iris/index.html` riga 1738-1758). Cerca la funzione che
carica le email:

```bash
grep -n "loadEmailsFromFirestore\|getDocs.*iris_emails\|onSnapshot" projects/iris/pwa/index.html
```

Probabilmente trovi una `getDocs()` o `query().get()` che gira al boot e
su click manuale di refresh. Da sostituire con `onSnapshot()`.

**Pattern di sostituzione**:

```js
// PRIMA — lettura one-shot
const snap = await getDocs(query(
  collection(db, "iris_emails"),
  orderBy("receivedAt", "desc"),
  limit(100)
));
renderEmails(snap.docs.map(d => ({ id: d.id, ...d.data() })));

// DOPO — subscribe real-time
let unsubscribeIris = null;
function subscribeIrisEmails() {
  if (unsubscribeIris) unsubscribeIris();
  unsubscribeIris = onSnapshot(
    query(
      collection(db, "iris_emails"),
      orderBy("receivedAt", "desc"),
      limit(100)
    ),
    (snap) => {
      renderEmails(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.error("[iris] onSnapshot error", err);
    }
  );
}
subscribeIrisEmails();

// Cleanup quando l'utente lascia la pagina
window.addEventListener("beforeunload", () => {
  if (unsubscribeIris) unsubscribeIris();
});
```

**Importa `onSnapshot`** in cima al file se non c'è già:

```js
import { onSnapshot } from "https://www.gstatic.com/firebasejs/X.X.X/firebase-firestore.js";
```

(usa la versione Firebase già presente nel file, NON cambiarla).

Se il bottone "Ricarica" ora è inutile, lascialo come no-op o trasformalo
in un "Forza refresh sottoscrizione" che chiama `subscribeIrisEmails()` di
nuovo.

### Step 4 — Heartbeat poller (5 min lavoro extra, alto valore)

Aggiungi nel poller, in cima al loop principale:

```python
# pipeline.py o iris_local_poller.sh equivalent
import time
from google.cloud import firestore
db = firestore.Client(project="nexo-hub-15f2d")

# Dopo ogni ciclo riuscito:
db.collection("pharo_heartbeat").document("iris_poller").set({
    "lastBeat": firestore.SERVER_TIMESTAMP,
    "host": socket.gethostname(),
    "pid": os.getpid(),
    "poll_interval_sec": 60,
    "version": "iris-poller-v1.1",
}, merge=True)
```

(adatta il linguaggio al poller reale). Così PHARO può controllare se IRIS
sta girando.

**Non implementare l'alert PHARO qui** — quello è un task separato (Wave 2).
Solo scrivi l'heartbeat, la lettura sarà aggiunta dopo.

### Step 5 — Verifica end-to-end

1. Manda un'email a una casella monitorata da IRIS (chiedi ad Alberto di
   farlo, o usa un mittente di test se ne hai uno).
2. Aspetta 60-90 secondi.
3. Verifica che la PWA `https://nexo-hub-15f2d.web.app/iris/` mostri la
   email senza che tu prema F5.
4. Verifica che `pharo_heartbeat/iris_poller.lastBeat` su Firestore sia
   aggiornato negli ultimi 60s.

## Output

Scrivi `results/iris-poller-stabilization.md` con:

```markdown
# IRIS poller stabilization — applicato

## Step 1 — Riavvio poller
- Script usato: <path>
- PID nuovo: <pid>
- Logfile: <path>
- Email scritte su iris_emails dopo riavvio: N nei primi 5 min

## Step 2 — POLL_INTERVAL 60s
- File modificato: <path>:riga
- Vecchio valore: <X>s
- Nuovo valore: 60s
- Verifica nei log: ciclo ora ogni 60s ✅

## Step 3 — onSnapshot PWA
- File modificato: projects/iris/pwa/index.html righe X-Y
- Funzione subscribeIrisEmails() aggiunta
- Test: nuova email arriva e appare senza F5 ✅

## Step 4 — Heartbeat
- File modificato: <path poller>
- Collection: pharo_heartbeat/iris_poller
- Ultimo beat al momento del report: <timestamp>

## Step 5 — Verifica e2e
- Email test inviata a <indirizzo>
- Tempo dall'invio alla comparsa in PWA: <secondi>
- ✅ funziona end-to-end

## Cose ancora da fare (NON in questo task — vedi analisi)
- 3.3: push subscription Exchange (effort M, latenza <5s)
- 3.4: spostare poller su Hetzner / esporre Exchange
- Alert PHARO se heartbeat silente >10 min (Wave 2)
```

## Commit message

`fix(iris): stabilization poller — POLL_INTERVAL 60s, PWA onSnapshot, heartbeat (risolve zYNnGZA2qKiHgEo5ZrsV)`

## Cose da NON fare

- Non implementare push Exchange (3.3) qui dentro: è giorni di lavoro
- Non spostare il poller su Hetzner ora: l'analisi suggerisce DOPO 3.1-3.5
- Non toccare la logica di classificazione Haiku/Groq nel poller: scope creep
- Non aggiungere alert/notifiche: heartbeat scrive e basta, l'alert sarà altro task

## Se il poller non riparte

Se lo script di start non funziona o non esiste:
1. Cerca in `projects/iris/scripts/` qualunque file `*poller*` o `pipeline*`
2. Verifica `package.json` per script npm
3. Verifica systemd-user (`systemctl --user list-units | grep iris`)
4. Se proprio non trovi, scrivi nel result che l'avvio è fallito e
   chiedi ad Alberto di indicarti come avviarlo. NON inventarti uno script
   nuovo da zero.
