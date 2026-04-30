# Dev Analysis — ORZvCQkiUMwxOSx6SRkR (richiesta composta ARES + ECHO)

## Bug

Alberto: "manda ad alberto un messaggio wa con la sintesi dei suoi interventi di domani"
NEXUS: ha eseguito SOLO la query ARES (lista 6 interventi di domani per Alberto) e si è fermato lì. Il WA non è mai partito.

## Root cause

Il routing intent corrente (Groq llama-3.3-70b o Ollama qwen2.5:7b) classifica il messaggio come `ares.interventi_aperti` perché lo schema intent è single-collega: un messaggio = un collega = un'azione. Non c'è un meccanismo di "compound intent" che riconosca `[query ARES] + [send ECHO]`.

L'`orchestrator.js` esiste ma gestisce solo workflow predefiniti (`guasto_urgente`, riga 9 del file): non è un orchestratore generico per richieste composte.

## Proposte (3 opzioni, ordinate da meno a più invasiva)

### Opzione A — Compound intent in nexus.js (medio invasiva, raccomandata)

**Cosa**: estendere `tryDirectAnswer`/`DIRECT_HANDLERS` con un nuovo pattern regex che riconosce esplicitamente "manda (whatsapp|wa|messaggio) (a|al|per) X con (sintesi|riepilogo|elenco|cosa fa|cosa ha) (interventi|agenda|lavoro)" e crea un mini-workflow:
1. `handleAresInterventiAperti({tecnico: X, range: tomorrow})` — ottiene array `items[]`
2. Formatta gli items in un testo WA conciso (max 1500 char): "Ciao X, domani hai N interventi: 1) ... 2) ..."
3. `handleEchoWhatsApp({to: X, body: testo}, ctx)` — manda (rispetta DRY_RUN)
4. Risposta unificata: "Ho mandato a X il riepilogo dei N interventi di domani."

**Pro**: chirurgico, zero impatto su intent routing esistente, ben testabile via FORGE.
**Contro**: cattura solo questo pattern preciso. Pattern simili ("manda email con dossier", "scrivi WA con preventivo") richiederebbero ognuno un proprio handler.

**Rischio**: medio. Se DRY_RUN OFF, manderebbe veramente WA a clienti reali. Mitigazione: il flusso dev-request è già in DRY_RUN. Quando Alberto disabilita dry-run, deve testare con un destinatario interno (se stesso/Federico) prima di clienti.

### Opzione B — Compound intent generico tramite Groq (più potente, più rischioso)

**Cosa**: estendere il system prompt di Groq per produrre un array di azioni invece di una singola: `{azioni: [{collega: "ares", azione: "..."}, {collega: "echo", azione: "send_whatsapp", parametri: {testo: "{{result_of_step_1}}"}}]}`. Il dispatcher esegue gli step sequenzialmente, propagando i risultati.

**Pro**: copre TUTTE le richieste composte future ("manda preventivo a X", "fai dossier e mandalo a Y", ecc.) senza nuovi pattern.
**Contro**: invasivo (modifica al contratto intent, dispatcher, prompt), richiede testing massiccio per evitare allucinazioni LLM su workflow distruttivi (es. "cancella tutto e fai X"). Costo Groq più alto per la query più complessa.

**Rischio**: alto. Un LLM può allucinare azioni che l'utente non ha chiesto. Richiede whitelist rigida di azioni concatenabili.

### Opzione C — Orchestrator workflow dedicato

**Cosa**: nell'`orchestrator.js` aggiungere un nuovo workflow `wa_riepilogo_interventi` simile a `guasto_urgente`, con i suoi step loggati in `nexo_orchestrator_log`. NEXUS riconosce il pattern e posta sulla `nexo_lavagna` un evento `kind: "wa_riepilogo_interventi"` che l'orchestrator processa async.

**Pro**: tracciabilità completa (audit trail per WA mandati), riusabile per altri "manda X con dati Y".
**Contro**: latenza maggiore (async via lavagna), complessità di setup, overkill per un singolo pattern oggi.

**Rischio**: medio — più moving parts ma stesso problema dry-run.

## Raccomandazione

**Opzione A** ora (chirurgico, 1-2 ore di lavoro, FORGE-testabile). Se in futuro emergono altri pattern simili (manda email + dossier, manda WA + preventivo, ecc.), rivalutare se passare a Opzione B con whitelist rigida.

## Attesa input utente

Alberto, scegli l'opzione e procedo. Default suggerito: A.
