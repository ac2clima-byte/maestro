# Analisi dev-request B5PjXaK8fjzsVpOFQG2W

**Origine:** bottone "Segnala bug" globale (top-right della PWA — `source: report_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** (n/a) — il bottone globale non lega la richiesta a una sessione NEXUS.
**Data:** 2026-04-26 20:39 UTC
**Type:** `generic` (non `bug_from_chat`).
**Richiesta integrale:** "Leggi"

## Diagnosi — cosa ha generato questa richiesta

A differenza delle 7 dev-request precedenti di oggi (tutte `nexus_chat_bug_btn` con conversazione), questa arriva dal **bottone globale "Segnala bug"** (id `#reportBugBtn` in `index.html`). Quel bottone apre un modal isolato: textarea libera "Descrivi cosa non funziona…", nessun contesto chat, nessuna conversazione mandata. La richiesta è quindi **solo** la stringa che Alberto ha scritto: "Leggi".

Una sola parola, niente verbo flesso, niente complemento, niente codice/feature di riferimento. **Non è un bug report interpretabile** — è un input troppo povero perché Claude Code possa diagnosticare qualcosa di tecnico.

Tre ipotesi su cosa è successo:

### Ipotesi A — comando rivolto a NEXUS finito per errore nel canale bug
Alberto stava per usare NEXUS chat (il FAB 💬 in basso a destra), ha cliccato per errore il bottone "Segnala bug" (in alto a destra), si è aperto il modal "Segnala un bug" e ha digitato "Leggi" pensando di chiedere a NEXUS "leggi le email" / "leggi gli appuntamenti" / "leggi i preventivi". Ha premuto Invia → la stringa è andata in `nexo_dev_requests` invece che in `nexus_chat`.

Indizio: i due bottoni sono entrambi sulla pagina e si differenziano solo per posizione e colore. Il modal "Segnala bug" globale ha placeholder "Descrivi cosa non funziona…" ma se Alberto digita veloce e non legge il titolo del modal può non accorgersene.

### Ipotesi B — test del bottone globale dopo deploy recente
Il commit `df6f579` (~3h fa) ha aggiunto il bottone 🐛 dentro la chat NEXUS con stile distinto (FORGE rosso/arancione). È plausibile che Alberto abbia verificato anche il vecchio bottone globale rimasto sopra a destra, scritto "Leggi" come parola di prova e premuto Invia per testare il flusso.

### Ipotesi C — feature request implicita / abbreviata
"Leggi" come stub di una richiesta che Alberto voleva scrivere meglio ("Leggi le mail di oggi e dimmi le urgenti", "Leggi i preventivi di marzo") ma ha mandato per sbaglio prima di completarla. La textarea non ha un minimum length, quindi accetta anche una sola parola.

Senza poter chiedere ad Alberto, **è impossibile sapere quale ipotesi è corretta**. Tutte e tre puntano allo stesso problema sottostante: **il bottone globale "Segnala bug" è troppo facile da usare male**.

### Bug reali identificati nel flusso del bottone globale

#### Bug 1 — nessuna validazione sostanziale del testo
`projects/nexo-pwa/public/js/app.js:3062-3065`:
```js
async function submitBugReport(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ok: false, error: "Scrivi una descrizione." };
  if (trimmed.length > 4000) return { ok: false, error: "Troppo lungo (max 4000 caratteri)." };
  ...
```

Solo non-vuoto e ≤4000 caratteri. **Una sola parola passa.** Nessun minimum length sensato (es. ≥10 caratteri) o controllo semantico (almeno un sostantivo + un verbo, oppure almeno una parola tra "non funziona / errore / bug / sbagliato / manca / serve / vorrei / quando").

#### Bug 2 — nessun contesto chat allegato dal bottone globale
A differenza del bottone 🐛 chat (`nexus_chat_bug_btn`) che salva gli ultimi 10 messaggi, il bottone globale **non allega nulla**. Per Claude Code è impossibile capire da dove viene la frustrazione. Aggiungere lo screenshot dello stato corrente, l'URL della pagina in cui si trova Alberto, oppure gli ultimi messaggi NEXUS della sessione attiva ridurrebbe drasticamente i casi di "Leggi" senza contesto.

#### Bug 3 — i due bottoni non sono distinguibili abbastanza
Il bottone globale `#reportBugBtn` è in alto a destra, fisso. Il bottone chat `#nexusBugBtn` è dentro l'header del pannello NEXUS (visibile solo a chat aperta). Gli scenari di confusione:
- Alberto scrive nel modal globale pensando di usare la chat.
- Alberto vuole segnalare un bug **specifico** della chat NEXUS ma usa il bottone globale (perdiamo conversazione).
- Alberto è in un'altra sezione della PWA, vede il bottone globale e ci scrive — ma non ricorda il dettaglio per descrivere bene.

#### Bug 4 — MAESTRO crea task anche per richieste palesemente vuote
`maestro.mjs:226-229`:
```js
const richiesta = String(
  data.description || data.request || data.message || JSON.stringify(data)
).slice(0, 4000);
```

Nessun controllo lato MAESTRO sulla qualità. Se `description` è < 10 caratteri o non contiene parole di "bug-language" (verbo+sostantivo), viene comunque materializzata in `tasks/dev-request-{id}.md` e Claude Code è chiamato a generare un'analisi. Costa ~3-5k token per analizzare una stringa di 5 caratteri.

## File coinvolti

| File | Righe | Ruolo |
|---|---|---|
| `projects/nexo-pwa/public/index.html` | 97-115 | bottone `#reportBugBtn` + modal `#reportBugModal` con textarea senza min length |
| `projects/nexo-pwa/public/js/app.js` | 3062-3083 | `submitBugReport`: validazione minima (non-vuoto, ≤4000) |
| `projects/nexo-pwa/public/js/app.js` | 3140-3160 | `reportBugSubmit click`: invio Firestore con cooldown 30s |
| `projects/nexo-pwa/public/js/app.js` | 1721-1795 | `nexusBugSubmit` (bottone chat): include conversazione automaticamente |
| `maestro.mjs` | 194-302 | `pollDevRequests`: legge da `nexo_dev_requests` e materializza task. Nessun filtro su qualità |
| `tasks/dev-analysis-fVsMsV2she6QI4kS0Czb.md` | tutta | analisi precedente del bottone bug chat — utile per confronto |

## Proposta — cosa cambiare, in che ordine, perché

### 1) Validazione client-side sostanziosa (S, critica)
**Dove:** `app.js:3062-3083` (`submitBugReport`).
**Cosa fa:** prima del submit, verifica:
- min length 15 caratteri (parola singola scartata)
- almeno una parola tra: bug, errore, problema, non, manca, serve, vorrei, sbagliat, non funzion, falliscono, non gira, lento, perso, mancante, blocca, crasha
- almeno 3 parole separate da spazio

Se non passa, mostra inline:
> "Aggiungi qualche dettaglio: cosa stavi facendo, cosa ti aspettavi, cosa è successo. Min 15 caratteri."

```js
const trimmed = String(text || "").trim();
if (trimmed.length < 15) return { ok: false, error: "Aggiungi qualche dettaglio: cosa stavi facendo, cosa ti aspettavi, cosa è successo. Min 15 caratteri." };
const wc = trimmed.split(/\s+/).length;
if (wc < 3) return { ok: false, error: "Almeno 3 parole. Esempio: 'Quando apro la chat il microfono non parte.'" };
```

**Perché:** evita che "Leggi" / "test" / "no" diventino dev-request da analizzare. Riduce noise in coda Claude Code.

### 2) Aggiungere contesto automatico anche al bottone globale (S)
**Dove:** `app.js:submitBugReport`.
**Cosa fa:** anche quando arriva dal bottone globale, allega contesto utile gratis:
- `currentRoute`: hash o pathname corrente (es. "#home", "#iris/email/123")
- `currentSection`: nome sezione visibile (header)
- `lastNexusMessages`: opzionale, ultimi 5 messaggi NEXUS della sessione attiva (se chat è stata aperta)
- `userAgent` (browser/device per debug)
- `screenshot` (canvas → base64): NICE-TO-HAVE, ma utile per bug visivi

```js
const payload = {
  description: trimmed,
  status: "pending",
  source: "report_bug_btn",
  userId: me,
  context: {
    route: location.hash || location.pathname,
    section: document.querySelector("#topbarTitle")?.textContent || null,
    userAgent: navigator.userAgent.slice(0, 200),
    activeSessionId: NEXUS_SESSION_ID || null,
    lastMessages: NEXUS_MESSAGES.slice(-5).map(m => ({role: m.role, content: String(m.content||"").slice(0, 500)})),
  },
  createdAt: fsMod.serverTimestamp(),
};
```

**Perché:** Claude Code può vedere "Alberto era nella sezione IRIS quando ha scritto questo bug" → ipotesi più mirate.

### 3) Differenziare visivamente e nominare diversamente i due bottoni (S)
**Dove:** `index.html` + `main.css`.
**Cosa fa:**
- Rinominare il bottone globale da "Segnala bug" a **"Idea / Feedback"** (più ampio, copre richieste non-bug come "Leggi" inteso come feature).
- Cambiare colore globale: oggi entrambi hanno toni rossi/arancioni vicini. Globale → blu/verde (suggerisce "feedback positivo / idea"). Chat → rosso (bug specifico).
- Modal globale: aggiungere selettore radio "Tipo: Bug / Idea / Domanda" → `nexo_dev_requests.kind` differenziato → MAESTRO può smistare diversamente.
- Modal title chat: "Segnala bug nella chat" (dichiara conversazione allegata).

**Perché:** un click sbagliato passa in una rotta diversa con conseguenze diverse.

### 4) Rate limit + spam guard lato MAESTRO (S)
**Dove:** `maestro.mjs:194-302` (`pollDevRequests`).
**Cosa fa:**
- Se `description` < 15 char → marca `status: "spam"` e non materializza il task.
- Se da stesso utente arrivano > 10 dev-request in 1 ora → throttling, marca `status: "rate_limited"` per le successive.
- Se due dev-request consecutive dello stesso utente hanno `description` identica → marca la seconda `status: "duplicate"` e skip.

**Perché:** difesa in profondità contro testo client e attacchi (anche involontari).

### 5) Conferma esplicita prima del submit (S, opzionale)
**Dove:** `app.js:reportBugSubmit click`.
**Cosa fa:** prima dell'invio, mostrare il preview "Ecco cosa mando: [riassunto]. Confermi?". Se Alberto vede che il "preview" dice "Leggi", capisce subito che era una bozza incompleta.

**Perché:** richiede 1 click in più ma elimina i submit accidentali.

### 6) Self-handling per richieste minime (M, opzionale)
**Dove:** MAESTRO o un nuovo step di pre-processing.
**Cosa fa:** se la `description` è < 15 char, **non chiamare Claude Code**. MAESTRO scrive direttamente:
> "La tua richiesta era 'Leggi' (1 parola). Per analizzarla mi serve più contesto. Riformula nella chat o nel bug report dicendo cosa stavi facendo, cosa ti aspettavi, cosa è successo."

E manda il messaggio nella sessione NEXUS (se c'è) o per email a Alberto.

**Perché:** chiude il loop senza sprecare token.

## Rischi e alternative

### R1 — Min length troppo aggressiva
Se min = 15 caratteri taglia anche bug report legittimi corti come "non scrolla" (11 char). Mitigazione: min 12 + check su keyword bug-language.

### R2 — Whitelist parole "bug-language" italiana
La lista rischia di diventare un vocabolario da manutenere. Mitigazione: tenerla MOLTO permissiva (qualsiasi negazione, qualsiasi richiesta, qualsiasi nome di feature), e usare il check come *avvertimento soft* ("Sei sicuro? Manca un dettaglio") invece che blocco hard.

### R3 — Richiesta legittima "molto corta" perché contesto è chiaro
Es. dopo aver fatto qualcosa, "non funziona" è perfetta come bug report (Alberto vorrebbe segnalare quel "qualcosa" appena fatto). Mitigazione: con la proposta 2 (contesto automatico) "non funziona" + screenshot/route ha senso. Quindi possiamo accettare anche descrizioni brevi *se* il contesto allegato è ricco.

### R4 — Cambiare etichetta bottone globale può confondere
Da "Segnala bug" a "Idea / Feedback" cambia l'aspettativa. Mitigazione: testo più descrittivo "Hai un'idea, una domanda o un bug?".

### R5 — Conferma esplicita peggiora UX per i bug seri
Se Alberto è arrabbiato e vuole mandare 3 bug in fila, la conferma rallenta. Mitigazione: opzionale + ricordabile via flag localStorage ("non chiedere più").

### Alternative scartate

- **A1: rimuovere il bottone globale.** Rispetto alla soluzione "differenziare", elimina capacity. Bocciato.
- **A2: forzare l'utente a aprire la chat NEXUS prima di poter segnalare.** Cambia il flow troppo.
- **A3: chiedere ad Alberto via email "cosa intendevi con Leggi?".** Funzionerebbe per questa richiesta ma non scala.

## Effort stimato

**Totale: S (small)** — 60-90 minuti netti.

| Step | Effort |
|---|---|
| 1) validazione client-side sostanziosa | S — 15' |
| 2) contesto automatico (route, section, lastMessages, UA) | S — 25' |
| 3) differenziare bottoni (rinomina + colori + modal radio) | S — 30' |
| 4) rate limit MAESTRO + spam guard | S — 20' |
| 5) conferma preview submit (opzionale) | S — 10' |
| 6) self-handling per richieste minime (opzionale, fuori scope MVP) | M — 60' |
| Deploy + email + commit | S — 10' |

## Test di accettazione

1. **Submit con "Leggi"** → bloccato in client-side con messaggio "Aggiungi qualche dettaglio…".
2. **Submit con "non funziona"** → accettato (>= 3 parole se conto whitespace? no, 2). Edge: "non funziona" è un bug report classico ma 2 parole. Decidere se permetterlo (sì) o richiedere min 3 parole (no, troppo restrittivo). Decisione: min 12 caratteri OPPURE almeno 3 parole, in OR.
3. **Submit duplicato (stesso testo entro 30s)** → bloccato lato MAESTRO con `status: duplicate`.
4. **Submit con contesto** → doc Firestore contiene `context.route`, `context.section`, `context.lastMessages` valorizzati.
5. **Bottone globale renderato in blu/verde + chat in rosso** → distinguibili a colpo d'occhio.
6. **Modal globale ha radio Bug/Idea/Domanda** → `nexo_dev_requests.kind` riflette la scelta.

## Nota operativa per Alberto

Anche se questa specifica richiesta "Leggi" non porta valore informativo per Claude Code, la sua *esistenza* è un segnale utile: l'UX del bottone globale ha qualcosa che non va. Le proposte sopra trasformano ogni "Leggi" futuro in un report decifrabile, oppure lo bloccano prima che diventi rumore.
