# Analisi Dev Request `IpLhnHlTK3TfJVTIuYtG`

> Richiesta originale (Alberto, 2026-04-26 15:59:27 Europe/Rome):
> *"Errore archiviazione: Sessione scaduta, rifai login."*

---

## 1. Diagnosi — cosa succedeva e perché

Il messaggio è il **toast rosso di errore** che la pagina IRIS mostrava quando l'utente cliccava il bottone "📦 Archivia" (o "🗑️ Elimina") su una card email. La stringa esatta visibile era:

```
Errore archiviazione: Sessione scaduta, rifai login.
```

Composta da due pezzi:
- `"Errore archiviazione: "` — prefisso dello showToast in `archiveEmailFromCard` (`projects/nexo-pwa/public/iris/index.html:1723`).
- `"Sessione scaduta, rifai login."` — messaggio dell'`Error` lanciato dentro `callIrisAction()` quando `getAuthIdToken()` ritornava `null`.

### Catena causa-effetto

1. La pagina IRIS gira in **MOCK_MODE** (`projects/nexo-pwa/public/iris/index.html:1581`):

   ```js
   const MOCK_MODE = true;
   ```
   Questo flag bypassa il login Firebase Auth e mostra subito la dashboard. È documentato come "TEMP v0.1: login bypassato, da ripristinare quando Firebase Auth sarà configurato".

2. Conseguenza: `bootAuth()` (`projects/nexo-pwa/public/iris/index.html:3146-3155`) ritorna immediatamente senza chiamare `firebaseAuth.onAuthStateChanged`, quindi `window.__irisCurrentUser` resta `null` per sempre.

3. `getAuthIdToken()` (riga `1655-1659`) ritorna `null` perché non c'è user.

4. `callIrisAction()` (versione **pre-fix**, riga `1671` del codice precedente) faceva:
   ```js
   const token = await getAuthIdToken();
   if (!token) throw new Error("Sessione scaduta, rifai login.");
   ```

5. L'errore veniva catturato da `archiveEmailFromCard` (riga `1722-1726`) e mostrato come toast rosso.

### Stato attuale

La dev request è stata **già risolta** dal commit `70c12a4 result: fix-iris-archivia` (2026-04-26 16:17:57 Europe/Rome) e dal commit semantico `34e11e8 fix(iris): archivia e elimina email funzionanti` (16:19:33). La timeline è:

| Tempo | Evento |
|---|---|
| 2026-04-26 15:59:27 | Alberto invia la dev request da NEXUS |
| 2026-04-26 16:17:57 | Commit `70c12a4` rilasciato — fix codice + test E2E 8/8 OK |
| 2026-04-26 16:19:33 | Commit `34e11e8` (marker semantico) |
| 2026-04-26 16:21:08 | MAESTRO materializza la dev request in `tasks/dev-request-IpLhnHlTK3TfJVTIuYtG.md` (poll ogni 2 minuti) |

Quando MAESTRO ha pollato la collection `nexo_dev_requests` e ha materializzato il file md, il bug era già stato chiuso. La presente analisi documenta la causa, conferma che il fix risolve, e indica i casi residui in cui il messaggio potrebbe ancora apparire.

---

## 2. File coinvolti

### Stack pre-fix (il codice che ha generato il toast visto da Alberto)

| File | Righe | Cosa faceva |
|---|---|---|
| `projects/nexo-pwa/public/iris/index.html` | 1581 | `const MOCK_MODE = true` — login Firebase bypassato. |
| `projects/nexo-pwa/public/iris/index.html` | 3146-3155 | `bootAuth()` ritorna subito in MOCK_MODE, niente `onAuthStateChanged`, `window.__irisCurrentUser` mai settato. |
| `projects/nexo-pwa/public/iris/index.html` | 1655-1659 | `getAuthIdToken()` ritorna null se manca user. |
| `projects/nexo-pwa/public/iris/index.html` (vecchia) | era ~1671 | `callIrisAction()`: `if (!token) throw new Error("Sessione scaduta, rifai login.")`. |
| `projects/nexo-pwa/public/iris/index.html` | 1714-1726 | `archiveEmailFromCard()`: catch dell'Error e toast rosso `"Errore archiviazione: " + err.message`. |
| `projects/iris/functions/index.js` (vecchia) | era ~1578 | `irisArchiveEmail` richiedeva `verifyAcgIdToken` obbligatorio (HTTP 401 senza token). |
| `projects/iris/functions/handlers/shared.js` (vecchia) | era ~105 | `applyCorsOpen` non includeva `X-Forge-Key` negli `Access-Control-Allow-Headers`. |

### Stack post-fix (`70c12a4`)

| File | Righe | Cosa fa ora |
|---|---|---|
| `projects/nexo-pwa/public/iris/index.html` | 1645-1647 | Costanti URL endpoint + `IRIS_FORGE_KEY = "nexo-forge-2026"` (chiave statica fallback). |
| `projects/nexo-pwa/public/iris/index.html` | 1661-1682 | `callIrisAction()` ora ha auth a doppio binario: ID Token se disponibile, altrimenti `X-Forge-Key` header + `body.forgeKey`. Rimossa la clausola `throw "Sessione scaduta"`. |
| `projects/iris/functions/index.js` | 1572-1592 (helper `checkArchiveDeleteAuth`) e 1593-1638 (handler) | `irisArchiveEmail` e `irisDeleteEmail` accettano sia `verifyAcgIdToken` sia `forgeKey` (chiave statica). 401 solo se nessuna delle due viene fornita. |
| `projects/iris/functions/handlers/shared.js` | 105 | `applyCorsOpen` ora include `X-Forge-Key` tra `Access-Control-Allow-Headers` (preflight CORS prima bloccato). |

### File correlati che NON erano coinvolti

- `projects/nexo-pwa/public/js/app.js:2099` — qui c'è ancora `alert("Sessione scaduta, rifai login.")` ma è in un contesto diverso (dashboard NEXO root, non pagina IRIS) e usa `alert()`, non `showToast`, quindi il messaggio visto da Alberto non veniva da qui.
- `projects/iris/functions/handlers/iris.js::handleIrisArchiveEmail` — la business logic backend non era il problema: scrive correttamente la coda + status `archived`.

---

## 3. Proposta — cosa cambiare ulteriormente (oltre al fix già fatto)

Il fix `70c12a4` chiude il bug riportato. Però lascia intatte alcune ambiguità che, se non sistemate, potrebbero ricreare lo stesso messaggio di errore in scenari diversi. Consiglio 4 azioni di follow-up — **tutte non urgenti**, tutte per robustezza.

### 3.1 Auth-fallback più chiaro nei messaggi di errore

Anche oggi se entrambi i path falliscono (l'utente disabilita JS, blocca cookies, oppure `IRIS_FORGE_KEY` viene rivocata) il messaggio resta tecnico. Sostituire:

```js
throw new Error(`HTTP ${resp.status}: ${t.slice(0, 150)}`);
```

con uno specifico per `401`:

```js
if (resp.status === 401) {
  throw new Error("Autorizzazione fallita. Riapri la pagina IRIS o segnala il problema da NEXUS.");
}
```

### 3.2 Eliminare la stringa "Sessione scaduta" anche da `app.js`

`projects/nexo-pwa/public/js/app.js:2099` mostra ancora l'`alert()` con "Sessione scaduta, rifai login." per il digest home. Se Alberto vede di nuovo lo stesso testo (in contesti diversi dalla pagina IRIS) crea confusione. Allineare con il pattern doppio binario o, almeno, riformulare il testo.

### 3.3 Rimuovere `MOCK_MODE = true`

La causa radice è che il login Firebase è bypassato. Quando il login sarà attivato (`MOCK_MODE = false` o legato a `?mock=1` solo dev), il fallback `X-Forge-Key` non sarà più necessario in produzione e si tornerà al solo ID Token. Va in roadmap come task indipendente: **abilitare Firebase Auth nella pagina IRIS** e nascondere `IRIS_FORGE_KEY` (in produzione una chiave statica nel JS è sub-ottimale, anche se il backend ha rate-limit).

### 3.4 Test di non-regressione

`test-iris-archive-e2e.mjs` (creato col fix) esercita click → backend → Firestore. Aggiungerlo a una suite "smoke post-deploy" che:
- viene rieseguita dopo ogni `firebase deploy --only hosting`,
- crea email di test on-the-fly in `iris_emails`,
- verifica `status` aggiornato,
- pulisce le email di test al termine.

Pattern già pronto in `test-iris-archive-e2e.mjs`, basta wirearlo a un workflow CI.

### 3.5 Audit log dei click action

Per debug futuro: l'endpoint `irisArchiveEmail` potrebbe scrivere su una collection `iris_action_log` ogni `(emailId, authMode, timestamp, userIp)`. Permetterebbe di rintracciare chi ha cliccato cosa e da quale path auth, utile per il giorno in cui Firebase Auth sarà attivato e si vorrà capire chi sta usando ancora il path `forge_key`.

### Ordine di implementazione consigliato

1. **3.4 Test smoke post-deploy** — più valore con meno costo, copre regressioni future automaticamente.
2. **3.1 Messaggio errore più chiaro** — micro-cambio UI, ~10 minuti.
3. **3.5 Audit log** — utile per debug, ~30 min.
4. **3.2 Allineare `app.js`** — coerenza, ~10 minuti.
5. **3.3 Rimuovere MOCK_MODE** — task grosso (richiede attivare Firebase Auth + roundtrip login), va programmato a parte.

Niente di tutto questo è urgente: il bug riportato è chiuso.

---

## 4. Rischi e alternative

### Rischi

| Rischio | Mitigazione |
|---|---|
| `IRIS_FORGE_KEY` hard-coded nel JS bundle pubblico → un attaccante può estrarla e chiamare gli endpoint | Mitigato dall'allowlist su `to` (solo email del dominio ACG nello storage), dai validatori (`emailId` deve esistere), dalla stessa rule Firestore che limita la collection. Ma il rischio resta: chiunque legga l'HTML della PWA può marcare email come archived/deleted. **Quando MOCK_MODE sarà rimosso, eliminare anche il fallback X-Forge-Key dal frontend.** |
| Utente vede ancora "Sessione scaduta" in altre pagine | 3.2 (allineare `app.js`). |
| Cache CDN serve la vecchia versione della PWA → bug ancora visibile per qualche minuto | Già mitigato: `firebase.json` imposta `Cache-Control: no-cache` per .html/.js/.css. Verificato che la nuova versione è online. |
| Il consumer Hetzner non legge ancora `iris_archive_queue` / `iris_delete_queue` → l'email resta in Inbox Outlook anche dopo "Archivia" | Gap noto, fuori scope di questo bug. È un task separato per la roadmap. |

### Alternative che ho scartato

- **Cambiare la rule Firestore di `iris_emails` per permettere write client diretto al campo `status`**: aggira l'auth e la Cloud Function, ma esporrebbe la collection a write arbitrari (anche per status non previsti). Rifiutata.
- **Creare un secondo endpoint pubblico `irisQuickAction` separato**: duplicazione di codice. La soluzione doppio-binario nello stesso endpoint è più chirurgica.
- **Abilitare Firebase Auth subito nella pagina IRIS**: troppo invasivo per un bug fix immediato; va programmato come task dedicato (vedi 3.3).

---

## 5. Effort stimato — **già fatto** (il bug è chiuso)

Il bug originale è risolto dal commit `70c12a4 result: fix-iris-archivia` + `34e11e8 fix(iris): archivia e elimina email funzionanti`. Effort già consumato: ~45 min (diagnosi + 3 deploy iterativi per CORS preflight + test E2E).

Per i follow-up proposti in §3:

| Azione | Effort |
|---|---|
| 3.4 Test smoke post-deploy CI | **S** (~30 min) |
| 3.1 Messaggio errore più chiaro su 401 | **S** (~10 min) |
| 3.5 Audit log click action | **S** (~30 min) |
| 3.2 Allineare `app.js` | **S** (~10 min) |
| 3.3 Rimuovere `MOCK_MODE` (richiede login Firebase reale + flusso autenticato in IRIS) | **M** (~3 ore) |

Totale follow-up: ~4-5 ore se si vogliono fare tutti, ma nessuno è urgente.
