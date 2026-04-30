# Dev Request da NEXUS
Data: 2026-04-30T19:06:09.330Z
ID Firestore: ZrzjjCRf4BxCYOts7UUj
User: alberto.contardi@acgclimaservice.com
Session: nx_5i0iblg1mols5ezq
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T17:51:04.727Z

> Ciao

### NEXUS · stato:completata · 2026-04-30T17:51:06.480Z

> Sono qui, dimmi.

### ALBERTO · 2026-04-30T17:56:28.948Z

> Puoi mandare un wathsapp?

### NEXUS · stato:completata · 2026-04-30T17:56:31.045Z

> Mi manca il destinatario. Prova: 'manda whatsapp a Malvicino: testo'.

### ALBERTO · 2026-04-30T17:56:49.189Z

> Victor dellafiore lavoro

### NEXUS · stato:completata · 2026-04-30T17:56:53.165Z

> Victor dellafiore non ha interventi attivi in bacheca (cercato: 0 card totali, solo aperti).

### ALBERTO · 2026-04-30T19:05:30.661Z

> Non funziona la dettatura vocale su pwa

### NEXUS · stato:claude_pending · 2026-04-30T19:05:31.296Z

> 🧠 Claude sta pensando… (può impiegare fino a 60 secondi)

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-ZrzjjCRf4BxCYOts7UUj.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-ZrzjjCRf4BxCYOts7UUj")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "ZrzjjCRf4BxCYOts7UUj: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_5i0iblg1mols5ezq`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-ZrzjjCRf4BxCYOts7UUj.md` con 2-3 alternative e fermati.
