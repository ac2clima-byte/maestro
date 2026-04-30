# Dev Request da NEXUS
Data: 2026-04-30T19:30:40.460Z
ID Firestore: Ew4s55aX2oJKxa282s7F
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

### ALBERTO · 2026-04-30T19:29:41.047Z

> interventi di alberto di domani?

### NEXUS · stato:completata · 2026-04-30T19:29:44.136Z

> Alberto domani esegue 1 intervento e ha in agenda 5 interventi (non ancora eseguiti).
> 
> 01/05/2026, CONDOMINIO ELITE - VIA CARLO MARX 26 - VOGHERA (PV), ritorno programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO MARCONI PONTECURONE, ritorno programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO ASSISI - VIA SAN FRANCESCO D'ASSISI 15 - VOGHERA (PV) (VALVOLA BLOCCATA), ritorno eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO CASA NUOVA - VIA GARIBALDI 81 - NOVI LIGURE (AL), programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO GIARDINO 2 - VIA CARLO MARX 5/7 - VOGHERA (PV), ritorno programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO ALABARDA - VIA REPUBBLICA 109 - VOGHERA (PV), ritorno programmato non ancora eseguito, tecnico ALBERTO

### ALBERTO · 2026-04-30T19:29:55.330Z

> manda la lista ad alberto

### NEXUS · stato:completata · 2026-04-30T19:29:58.684Z

> Messaggio inviato a Alberto Contardi su WhatsApp.

### ALBERTO · 2026-04-30T19:30:26.326Z

> manda ad alberto anche i dettagli degli interventi

### NEXUS · stato:completata · 2026-04-30T19:30:29.389Z

> Non trovo "alberto anche i dettagli degli interventi" né nella rubrica interna (cosmina_contatti_interni) né nei clienti (cosmina_contatti_clienti).
> 
> Verifica che il nome sia corretto e che il contatto abbia un telefono popolato.

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-Ew4s55aX2oJKxa282s7F.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-Ew4s55aX2oJKxa282s7F")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "Ew4s55aX2oJKxa282s7F: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_3n6vksijmolvjxhl`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-Ew4s55aX2oJKxa282s7F.md` con 2-3 alternative e fermati.
