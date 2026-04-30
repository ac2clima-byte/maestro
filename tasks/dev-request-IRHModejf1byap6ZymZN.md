# Dev Request da NEXUS
Data: 2026-04-30T18:59:14.230Z
ID Firestore: IRHModejf1byap6ZymZN
User: alberto.contardi@acgclimaservice.com
Session: nx_6i4veujvmolukk7y
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T18:58:48.221Z

> manda whatsapp a Alberto: test

### NEXUS · stato:completata · 2026-04-30T18:58:52.869Z

> Messaggio inviato a Alberto Contardi su WhatsApp.

### ALBERTO · 2026-04-30T18:58:59.965Z

> mandane un'altro

### NEXUS · stato:errore_modello · 2026-04-30T18:59:02.104Z

> Errore interpretazione: Error: Groq 400: {"error":{"message":"Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for mo

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-IRHModejf1byap6ZymZN.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-IRHModejf1byap6ZymZN")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "IRHModejf1byap6ZymZN: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_6i4veujvmolukk7y`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-IRHModejf1byap6ZymZN.md` con 2-3 alternative e fermati.
