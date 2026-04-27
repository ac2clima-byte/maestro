# Analisi dev-request fTfm4gdbJixqTORHRVsk

**Origine:** bottone globale "Segnala bug" (top-right PWA — `source: report_bug_btn`).
**Utente:** alberto.contardi@acgclimaservice.com
**Sessione:** (n/a)
**Data:** 2026-04-26 21:23 UTC
**Type:** `generic`
**Richiesta:** "Legfi" (5 caratteri, evidente refuso di "Leggi")

> Questa è la **seconda occorrenza** dello stesso pattern in 41 minuti. La
> prima è la dev-request `B5PjXaK8fjzsVpOFQG2W` del 2026-04-26 20:39 UTC con
> descrizione "Leggi". L'analisi tecnica dei bug e la proposta di soluzione
> sono già descritte in dettaglio in
> **[`tasks/dev-analysis-B5PjXaK8fjzsVpOFQG2W.md`](./dev-analysis-B5PjXaK8fjzsVpOFQG2W.md)**.
> Questa analisi documenta il **rinforzo del segnale** e gli aggiustamenti
> alla proposta originale.

## Diagnosi — segnale rinforzato

A 41 minuti di distanza dalla prima "Leggi", una seconda dev-request "Legfi"
arriva dallo **stesso bottone globale**, dallo **stesso utente**, **senza
sessione né contesto**, con **una sola parola e un refuso**.

Statistiche `nexo_dev_requests` (totali 14):
- da bottone globale (`report_bug_btn`): **5**
- da bottone chat (`nexus_chat_bug_btn`): **7**
- description < 15 caratteri: **3** (21% del totale)
- delle 3 minimal: 2 sono "Leggi"/"Legfi" (refusi/parola incompleta), 1 è "ricerca errata"

Il pattern è chiaro: il bottone globale ha un **tasso di submit accidentali / incompleti** non trascurabile. Le 3 ipotesi della scorsa analisi (Alberto confonde i due bottoni / test / feature request abortita) restano valide. Il fatto che oggi compaia "**Legfi**" (con `f` al posto di `g` — tasti adiacenti su QWERTY italiana) suggerisce inoltre che Alberto stia digitando **velocemente sul mobile**, dove il mistap accade spesso, e che il submit avvenga **senza preview**.

## Nuove evidenze rispetto all'analisi B5PjXaK8fjzsVpOFQG2W

### NE-1 — il refuso "Legfi" indica origine mobile probabile
Su tastiera fisica il salto `g→f` è raro (tasti adiacenti ma il muscle memory normalmente non sbaglia su parole comuni). Su **tastiera mobile (touch)** è il tipo di errore più frequente. Quindi rinforziamo l'ipotesi che Alberto stia usando la PWA su mobile o tablet quando compila il bug report.

Il bottone globale `#reportBugBtn` è in alto a destra della PWA, sopra il pollice destro su un telefono. Click accidentali sono ancora più probabili su mobile dove i bottoni fissi sono raggiunti senza guardare.

### NE-2 — assenza totale di prevenzione lato client
Il `submitBugReport` (`app.js:3062-3083`) accetta qualsiasi stringa non vuota ≤ 4000 char. Una parola sola con typo passa senza warning. **Nessun controllo di "sembra una frase incompleta?"**, nessun "Sicuro che vuoi inviare?".

### NE-3 — il pattern si ripete: serve auto-detect
Visto che la stessa cosa è successa due volte in poche ore, è ragionevole investire 30 minuti di hardening client-side per ridurre alla fonte. La proposta originale prevedeva validazione (min length, min words). Confermo come fix prioritario.

### NE-4 — refuso "Legfi" può essere un segnale di un bug sottostante
Possibile interpretazione alternativa: Alberto sta provando a usare un **comando vocale** ("Leggi le mail") sul microfono NEXUS che ha trascritto male in "Legfi" e poi è finito nel bottone bug per qualche routing errato. Questa ipotesi è remota (Web Speech API normalmente non stampa "Legfi") ma vale la pena verificare nelle session NEXUS recenti se il microfono ha generato output simili.

Verificato: niente nei `nexus_chat` recenti contiene "Legfi" come content user. Quindi NON è output vocale finito altrove. È input testuale diretto nel modal del bottone globale.

## File coinvolti

Stessi file della precedente analisi. Per riferimento completo:

| File | Righe | Ruolo |
|---|---|---|
| `projects/nexo-pwa/public/index.html` | 97-115 | bottone `#reportBugBtn` + modal `#reportBugModal` con textarea senza min length |
| `projects/nexo-pwa/public/js/app.js` | 3062-3083 | `submitBugReport`: accetta stringhe minimali |
| `projects/nexo-pwa/public/js/app.js` | 3140-3175 | listener click submit con cooldown 30s |
| `maestro.mjs` | 194-302 | `pollDevRequests`: nessun filtro qualità |
| `tasks/dev-analysis-B5PjXaK8fjzsVpOFQG2W.md` | tutta | analisi originale con proposta a 6 step |

## Proposta — riconferma + aggiustamenti

Confermo la **proposta originale** della dev-analysis precedente (vedi link in cima). I 6 step erano:
1. Validazione client-side sostanziosa (min 12-15 caratteri o ≥ 3 parole).
2. Contesto automatico (route, section, lastNexusMessages, userAgent).
3. Differenziare bottoni globale e chat (rinomina + colori).
4. Rate limit + spam guard MAESTRO (skip materializzazione per request < 15 char o duplicate).
5. Conferma esplicita preview submit.
6. Self-handling per richieste minime (no chiamata Claude Code).

**Aggiustamenti**:

### A — alza priorità step 4 (server-side guard)
La duplicazione "Leggi"/"Legfi" mostra che la validazione client-side da sola non basta: Alberto può comunque mandare 2 richieste minime prima che il fix sia deployato. Lato MAESTRO bisogna intanto **skippare** materializzazione per `description < 15 char` (status `auto_dropped`). **Step 4 diventa il primo a essere implementato.**

### B — aggiungi check refuso/typo come warning soft
Quando l'utente clicca Invia, oltre alla validazione min-length:
- se la descrizione è una sola parola → "Sembra incompleta. Aggiungi cosa stavi facendo o cosa è successo."
- se contiene caratteri non-ascii consecutivi anomali (es. "qzx" in mezzo a una parola) → "Forse hai un refuso? Rileggi prima di inviare."

Implementabile come step opzionale dopo step 1.

### C — preview obbligatorio per request < 30 char
Per request brevi (< 30 char), **forziamo** la conferma preview ("Stai per mandare 'Legfi'. Conferma?"). Per request lunghe, opzionale (cooldown 30s già protegge).

Questo collega step 1 con step 5 dell'originale.

## Rischi e alternative

Stessi della scorsa analisi. Aggiungo:

### R6 — Alberto può percepire la validazione come "rompimento"
Se al prossimo bug serio scrive 10 parole e il sistema dice "manca un refuso!", Alberto si infastidisce. Mitigazione: il refuso check è **warning soft** (mostra messaggio ma lascia inviare se Alberto insiste cliccando Invia 2 volte).

### R7 — Duplicato in 41 minuti potrebbe essere mistap reale (zero malicia)
Probabile scenario: Alberto stava chattando con NEXUS, ha provato il bottone bug per testare o per errore, ha digitato la prima parola che gli veniva ("Leggi" — verbo che usa spesso con NEXUS) e ha premuto Invia velocemente. Senza nessuna intenzione di segnalare un bug. Mitigazione: la validazione + preview blocca questi flow accidentali alla fonte.

## Effort stimato

**Totale: S (small)** — 60-90 minuti, riconfermato.

Prioritizzazione rispetto alla scorsa analisi:

| Step | Priorità | Effort |
|---|---|---|
| **4) rate limit + spam guard MAESTRO** (status `auto_dropped` per desc<15 char + duplicate detect) | **alta — fai prima questa** | S — 25' |
| 1) validazione client-side min-length + min-words | alta | S — 15' |
| 5) preview + conferma per request < 30 char | media | S — 15' |
| 2) contesto automatico (route, section, UA, lastMessages) | media | S — 25' |
| B) typo/refuso check soft warning | bassa | S — 15' |
| 3) differenziare bottoni globale/chat | bassa (cosmetico) | S — 30' |
| 6) self-handling per richieste minime | bassa (overlap con step 4) | M — 60' |

## Test di accettazione

1. **Submit con "Legfi"** o "Leggi" → bloccato in client-side con messaggio "Aggiungi qualche dettaglio…".
2. **Submit con "non funziona"** → accettato (>= 12 char OR >= 3 parole — qui 12 char OK).
3. **MAESTRO skippa minimal**: una request `description="Legfi"` arriva su Firestore → MAESTRO la marca `status: auto_dropped`, NON crea `tasks/dev-request-{id}.md`, NON spende token Claude Code.
4. **Duplicato testuale**: due request consecutive dello stesso utente con `description` identica → la seconda `status: duplicate`.
5. **Preview obbligatorio**: textarea con < 30 char → modal mostra "Stai per mandare: '{testo}'. Conferma?" prima del submit.

## Nota operativa

Questa è la **6ª dev-request** ricevuta in giornata, di cui:
- 4 sostanziose (analizzate e implementate / proposte come fix)
- 2 minimali ("Leggi", "Legfi") che non portano informazione tecnica.

Il rapporto 33% di rumore è **alto**. Implementare gli step 4+1 (effort S, ~40 min combinati) è la fix più di alto valore in tutto il backlog di analisi accumulate oggi: riduce noise alla fonte, libera Claude Code per dev-request reali e chiude un ciclo di frustrazione potenziale per Alberto (che vede "le sue analisi" arrivare anche per click accidentali).
