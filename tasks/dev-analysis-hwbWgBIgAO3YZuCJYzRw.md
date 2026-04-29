# Dev Analysis — hwbWgBIgAO3YZuCJYzRw

Data analisi: 2026-04-29
Source: `tasks/dev-request-hwbWgBIgAO3YZuCJYzRw.md` (bug_from_chat,
sessione `nx_1r1cjjspmokefb65`)

## 1. Diagnosi

### Conversazione

```
[18:39] Alberto: Nella pva la dettatura vocale non funziona
        NEXUS: Ho registrato la richiesta DEV-001…              [OK, intercept dev]

[19:08] Alberto: Ciao
        NEXUS: Eccomi, cosa ti serve?                            [OK, regex L1]
        Alberto: Ciao
        NEXUS: Eccomi, cosa ti serve?                            [OK]

[19:09:01] Alberto: Che llm sto usando adesso?
[19:09:02] NEXUS: Stai utilizzando Nexus, il router di ACG Clima Service
                                                                  [BUG-A: elude]

[19:09:18] Alberto: Ma uso Claude o groq?
[19:09:19] NEXUS: Non capisco, potresti spiegare meglio?         [BUG-B: si arrende]
```

Due problemi distinti, entrambi sull'introspezione:

**BUG-A — "Che LLM sto usando?" → risposta evasiva**

Il LLM (Groq llama-3.3-70b) ha risposto "Stai utilizzando Nexus, il
router di ACG Clima Service". È **vero ma elude**: NEXUS è il router,
non il modello. La domanda di Alberto era sul **motore sottostante**.

Il LLM non sa di essere llama-3.3-70b perché il system prompt
(`nexus.js:53-258 NEXUS_SYSTEM_PROMPT` e `nexus.js:1491-1536
buildOllamaSystemPrompt`) **non gli dice mai** quale modello è.
Inoltre Groq potrebbe rispondere "Sono llama" in altri contesti, ma
il prompt qui dice "Sei NEXUS" → il modello eredita identità "NEXUS"
e non sa il proprio nome reale.

**BUG-B — "Ma uso Claude o groq?" → "Non capisco"**

Stessa famiglia bug `aJZD3WHPnM5JLAjHTZXl` già analizzato (riga
nessuno/chiarimento + frase "potresti spiegare meglio"). La domanda
è chiarissima per un essere umano: Alberto sta verificando se il
suo click è andato sul bottone ⚡ (Groq) o 🧠 (Claude).

Il LLM ha buttato la spugna perché:
1. Il prompt compatto non ha esempi di domande meta
2. L'informazione necessaria (engine usato in questo turno) è nei
   metadata `nexus_chat.engine` ma il LLM non legge quel campo
3. La regola "Se il messaggio non è chiaro, usa nessuno/chiarimento"
   (riga 1531) gli dà via d'uscita facile

**BUG-C — UX scoperta del bottone Claude**

Subordinato ma significativo. Alberto ha appena visto il deploy del
doppio pulsante (sessione del bug iniziata alle 19:08, deploy alle
~18:40). Stra chiede "uso Claude o groq?" perché:
- Vede i due bottoni ma non è sicuro di quale ha cliccato
- Oppure non li vede (cache PWA stale → hard reload necessario)
- Oppure vorrebbe un indicatore persistente di quale engine è in uso

### Verifica empirica

`curl https://nexo-hub-15f2d.web.app/` ritorna correttamente l'HTML
con entrambi i bottoni `#nexusSendBtn` (⚡) e `#nexusSendClaudeBtn`
(🧠). Quindi l'HTML servito è aggiornato. Se Alberto non li vede è
cache lato client (SW vecchio o cache iOS Safari).

Nota: nei messaggi della sessione `nx_1r1cjjspmokefb65`, le risposte
NEXUS hanno tutte `stato:assegnata` o `completata` (regex/Groq), nessuna
con `source:claude_code`. Quindi Alberto **non ha mai cliccato 🧠**
in questa sessione — sta usando solo ⚡. La domanda meta non è
"controllami quale ho appena cliccato" ma "cosa c'è dentro la chat".

## 2. File coinvolti

| File:riga | Cosa fa | Cosa modificare |
|-----------|---------|-----------------|
| `nexus.js:317-330 handleSalutoNexus` | Risposte canned a saluti | Aggiungere `handleMetaIdentita` per "che LLM/AI/modello stai usando", "chi sei", "che cervello hai" |
| `nexus.js:333-660 DIRECT_HANDLERS` | Regex pre-LLM | Aggiungere DIRECT_HANDLER per pattern meta-identità che leggi `engine` dal `nexus_chat` ultimo messaggio user |
| `nexus.js:53-258 NEXUS_SYSTEM_PROMPT` | Prompt lungo (orfano) | Aggiungere sezione "Identità tecnica" + esempi |
| `nexus.js:1491-1536 buildOllamaSystemPrompt` | Prompt compatto Groq+Ollama | Aggiungere riga "Se ti chiedono che modello sei: rispondi 'Sono llama-3.3-70b di Meta su Groq, parte del routing NEXUS di ACG Clima Service'." |
| `index.js:242 writeNexusMessage role:user` | Salva `engine` sul messaggio user | OK già fatto nella feature precedente, riusabile |
| `projects/nexo-pwa/public/css/main.css:1607` | `.nexus-btn-disabled` | (opzionale BUG-C) aggiungere indicatore "modello attivo" sopra l'input bar |

## 3. Proposta

Tre fix indipendenti, ordine consigliato.

### P1 — DIRECT_HANDLER meta-identità (S, basso rischio)

Aggiungere in `nexus.js:333-660 DIRECT_HANDLERS`, **prima** dei
saluti generici:

```js
{
  match: (col, az, ctx) => {
    const m = (ctx?.userMessage || "").toLowerCase().trim();
    return /^(che\s+(llm|ai|modello|cervello|intelligenz)|quale\s+(llm|ai|modello)|chi\s+sei|come\s+ti\s+chiami|cosa\s+stai\s+usando|che\s+motore|tu\s+sei\s+claude|usi\s+claude|usi\s+groq|claude\s+o\s+groq|groq\s+o\s+claude|che\s+modello\s+stai|sei\s+claude|sei\s+groq)\b.{0,80}\??\s*$/i.test(m);
  },
  fn: async (params, ctx) => {
    // Leggi l'engine dell'ultimo messaggio user di questa sessione
    const sid = ctx?.sessionId;
    let engine = "groq"; // default
    if (sid) {
      try {
        const snap = await db.collection("nexus_chat")
          .where("sessionId", "==", sid)
          .where("role", "==", "user")
          .orderBy("timestamp", "desc")
          .limit(1)
          .get();
        if (!snap.empty) {
          const last = snap.docs[0].data();
          engine = last.engine === "claude_code" ? "claude_code" : "groq";
        }
      } catch {}
    }
    if (engine === "claude_code") {
      return {
        content: "In questo momento stai parlando con Claude Code Max (Opus 4.7), avviato dal bottone 🧠. Risposta più lenta ma più approfondita. Per il routing veloce ACG (interventi/email/preventivi) usa il bottone ⚡ Invia.",
      };
    }
    return {
      content: "Stai usando il routing veloce NEXUS: regex per i pattern frequenti, llama-3.3-70b di Meta su Groq per il resto, fallback su qwen2.5:7b in Ollama (Hetzner). Decisione 28/04: Anthropic rimosso da NEXO, tutto Groq + Ollama. Se vuoi Claude Code (Opus 4.7), clicca il bottone 🧠 viola.",
    };
  },
},
```

Effetto:
- "che LLM sto usando?" / "uso Claude o Groq?" / "chi sei?" /
  "che modello?" → risposta canned, zero costo LLM, latenza ~50ms.
- Risposta differenziata in base al `engine` dell'ultimo messaggio
  user (così se Alberto ha cliccato 🧠 e poi chiede "che AI?", la
  risposta dice "Claude Code Max"; altrimenti "Groq llama").

### P2 — System prompt più trasparente (S, basso rischio)

In `nexus.js:1491-1536 buildOllamaSystemPrompt`, aggiungere PRIMA
del blocco "REGOLE":

```
IDENTITÀ TECNICA:
Sei alimentato da llama-3.3-70b-versatile di Meta su Groq Cloud
(routing veloce NEXUS, costo zero piano gratuito). Se Groq non è
raggiungibile, fallback su qwen2.5:7b di Alibaba in Ollama
self-hosted (Hetzner). Anthropic NON è più usato in NEXO (decisione
2026-04-29). Se Alberto chiede che modello sei, dillo onestamente
con queste informazioni — non eludere la domanda.

DOPPIO PULSANTE PWA:
La chat NEXUS ha 2 bottoni di invio:
- ⚡ (blu, default): routing veloce attraverso TE (regex → Groq → Ollama).
- 🧠 (viola): manda la domanda a Claude Code Max (Opus 4.7) via MAESTRO.
  Latenza 30-60s, qualità superiore per analisi profonde.
Se Alberto chiede quale sta usando, controlla i metadata della
sessione (engine="groq" vs "claude_code") e rispondi onestamente.
```

E modificare la riga 1531:
```
Se il messaggio non è chiaro E messages[] è vuoto o non c'è contesto
correlato, usa collega="nessuno" azione="chiarimento".
Per domande meta sull'identità ("che AI sei", "uso Claude o Groq")
NON usare chiarimento — rispondi direttamente con i dati IDENTITÀ TECNICA.
```

Effetto:
- Il modello acquisisce identità trasparente. Se P1 buca per qualche
  variante di pattern, P2 fa da rete di sicurezza nel prompt.

### P3 — UX: indicatore persistente engine attivo (M, medio rischio)

Subordinato (BUG-C). In `projects/nexo-pwa/public/css/main.css` e
`index.html`, aggiungere sopra/sotto la input bar un mini-indicatore:

```html
<!-- Sopra .nexus-input -->
<div class="nexus-engine-indicator" id="nexusEngineHint">
  <span class="active">⚡ Veloce (Groq)</span> · <span>🧠 Claude (long-press o bottone)</span>
</div>
```

CSS minimale (appena visibile, non invadente):
```css
.nexus-engine-indicator {
  font-size: 0.7rem;
  color: var(--text-muted);
  padding: 2px 12px;
  text-align: center;
}
.nexus-engine-indicator .active { color: var(--nexus-accent-dark); font-weight: 600; }
```

E in `app.js`, dopo ogni `nexusSend({engine})`, aggiornare quale span
ha la classe `active` (ricorda l'ultimo motore usato in localStorage
così persiste tra sessioni).

Effetto: Alberto vede sempre quale è il "default" del bottone Enter,
e sa che 🧠 è alternativo.

## 4. Rischi e alternative

### Rischi

- **R1 (P1)** — La regex potrebbe matchare frasi non-meta. Es. "tu
  sei claude o groq" può uscire in un contesto sarcastico/ironico.
  Mitigazione: la regex richiede `^...?$` (frase intera) e include
  solo verbi/sostantivi tecnici. Test su 8-10 varianti.
- **R2 (P1)** — Lookup `nexus_chat.where(role==user).orderBy(timestamp).limit(1)`
  richiede indice composito (sessionId + role + timestamp). Se manca,
  query fallisce. Mitigazione: try/catch con fallback default
  `engine="groq"` (già presente nel codice proposto).
- **R3 (P2)** — Il prompt cresce di ~150 token. Quota Groq gratuita
  14400 req/giorno = margine ampio, impatto trascurabile.
- **R4 (P3)** — Indicatore visibile può essere visivamente rumoroso
  su mobile. Mitigazione: mostrare SOLO al primo accesso (dismiss
  con localStorage flag), oppure solo nei primi N turni di sessione.

### Alternative

- **A1 — Solo P1**: 5 minuti di lavoro, risolve il 90% dei casi.
  Raccomandato come primo intervento.
- **A2 — Solo P2** (prompt fix): più elegante, ma dipende dalla
  qualità di llama-3.3-70b nel seguire l'istruzione. Se sgarra, P1
  catturava prima.
- **A3 — Hard-code direttamente in `rispostaUtente` quando azione==
  "chiarimento" e pattern matcha**: brutto, sconsigliato.
- **A4 — Nascondere completamente l'identità tecnica e rispondere
  "Sono NEXUS" sempre**: opzione "marketing-style". Ma Alberto è
  dev/owner e vuole sapere — sarebbe una scelta antiproduttiva.

**Raccomandazione**: P1 + P2 insieme (cintura + bretelle). P3 è
opzionale e da valutare con Alberto se davvero ne sente il bisogno.

## 5. Effort

| Step | Effort | Test richiesto |
|------|--------|----------------|
| P1 — DIRECT_HANDLER meta + lookup engine | **S** (30 min) | Test FORGE su 8 varianti: "che LLM?", "uso Claude o Groq?", "che modello?", "chi sei?", "che AI?", "che cervello hai?", "che motore?", "sei claude?". |
| P2 — Prompt aggiornato | **S** (15 min) | Test FORGE: 3 varianti che NON matchano P1, verificare che il LLM risponda comunque correttamente. |
| P3 — UX indicatore engine | **M** (1.5h) | Test su mobile (iOS/Android) e desktop. |

**Totale P1+P2**: **S** (1h dev + test FORGE + deploy). Senza P3.
**Con P3**: **M** (mezza giornata).

### Test FORGE consigliati

```
Sessione baseline (P1+P2 attivi):
1. "che LLM sto usando adesso?" → risposta veloce su llama-3.3-70b/Groq
2. "uso Claude o groq?" → risposta differenziata su engine ultimo turno
3. "chi sei?" → "Sono NEXUS, alimentato da llama-3.3-70b…"
4. "che modello stai usando?" → idem
5. "tu sei claude?" → "No, sono llama-3.3-70b… per Claude clicca 🧠"
6. "che cervello hai?" → idem
7. "ciao" (regression) → handler saluto canned, NON intercept meta

Negativi (NON devono triggerare il nuovo handler):
8. "ti spiego che LLM mi serve per il preventivo" → routing normale
9. "ho un cliente che si chiama Claude" → MEMO/cerca_condominio
10. "che intervento ha Marco?" → ARES (no match meta)
```

## 6. Note operative

- Nessuna modifica a Firestore schema, rules, IAM, secrets.
- Deploy: `firebase deploy --only functions:nexusRouter`.
- P3 richiede deploy hosting + cache busting bump.
- Compatibile con feature `doppio pulsante Groq + Claude Code Max`
  (commit `14103540`).
- **Coordinamento con analisi precedenti**: P1 di questa analisi
  cattura una sotto-famiglia (meta-identità) della stessa famiglia
  affrontata da `aJZD3WHPnM5JLAjHTZXl` e `4T1mt8sJgwFht1tYXoKg`
  (follow-up brevi non capiti dal LLM). I 3 handler proposti
  (`handleFollowUpConferma`, `handleMetaIdentita`, eventuale
  `handleMetaContesto`) condividono pattern: regex `^...?$` + lookup
  contesto Firestore + risposta canned. **Possibile fattorizzare**
  in un helper `directHandlerWithContext(matchRegex, contextFn,
  responseFn)` se i casi crescono.

Niente da implementare ora, come da istruzioni del task.
