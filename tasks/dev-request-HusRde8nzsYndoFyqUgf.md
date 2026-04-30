# Dev Request da NEXUS
Data: 2026-04-30T19:27:53.248Z
ID Firestore: HusRde8nzsYndoFyqUgf
User: alberto.contardi@acgclimaservice.com
Session: nx_3n6vksijmolvjxhl
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T19:27:26.617Z

> che llm usi?

### NEXUS · stato:assegnata · 2026-04-30T19:27:28.208Z

> Uso un modello di linguaggio sviluppato da OpenAI, basato su GPT‑4.

### ALBERTO · 2026-04-30T19:27:47.554Z

> sicuro?

### NEXUS · stato:assegnata · 2026-04-30T19:27:48.831Z

> Certo, dimmi pure cosa ti serve.

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-HusRde8nzsYndoFyqUgf.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-HusRde8nzsYndoFyqUgf")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "HusRde8nzsYndoFyqUgf: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_3n6vksijmolvjxhl`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-HusRde8nzsYndoFyqUgf.md` con 2-3 alternative e fermati.
