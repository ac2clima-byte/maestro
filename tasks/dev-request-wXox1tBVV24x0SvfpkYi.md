# Dev Request da NEXUS
Data: 2026-04-30T18:32:03.352Z
ID Firestore: wXox1tBVV24x0SvfpkYi
User: alberto.contardi@acgclimaservice.com
Session: nx_07a2wsn9moltlupv
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T18:31:48.119Z

> manda whatsapp a Alberto: test

### NEXUS · stato:completata · 2026-04-30T18:31:50.580Z

> Modalità test attiva: il messaggio a Alberto Contardi è stato preparato ma non spedito. Per abilitare gli invii reali bisogna togliere il dry-run da cosmina_config/echo_config (è una modifica di sicurezza, va fatta manualmente).

### ALBERTO · 2026-04-30T18:31:57.186Z

> togli dry run

### NEXUS · stato:assegnata · 2026-04-30T18:31:58.520Z

> Ciao, non capisco cosa intendi con dry run, puoi spiegarmi meglio?

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-wXox1tBVV24x0SvfpkYi.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-wXox1tBVV24x0SvfpkYi")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "wXox1tBVV24x0SvfpkYi: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_07a2wsn9moltlupv`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-wXox1tBVV24x0SvfpkYi.md` con 2-3 alternative e fermati.
