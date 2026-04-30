# Dev Request da NEXUS
Data: 2026-04-30T19:00:41.377Z
ID Firestore: QGCm3vgSguGCiZ4UWem4
User: alberto.contardi@acgclimaservice.com
Session: nx_6i4veujvmolukk7y
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T18:59:42.810Z

> che interventi ha alberto domani?

### NEXUS · stato:completata · 2026-04-30T18:59:45.648Z

> Alberto domani esegue 1 intervento e ha in agenda 5 interventi (non ancora eseguiti).
> 
> 01/05/2026, CONDOMINIO ELITE - VIA CARLO MARX 26 - VOGHERA (PV), ritorno programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO MARCONI PONTECURONE, ritorno programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO ASSISI - VIA SAN FRANCESCO D'ASSISI 15 - VOGHERA (PV) (VALVOLA BLOCCATA), ritorno eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO CASA NUOVA - VIA GARIBALDI 81 - NOVI LIGURE (AL), programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO GIARDINO 2 - VIA CARLO MARX 5/7 - VOGHERA (PV), ritorno programmato non ancora eseguito, tecnico ALBERTO
> 01/05/2026, CONDOMINIO ALABARDA - VIA REPUBBLICA 109 - VOGHERA (PV), ritorno programmato non ancora eseguito, tecnico ALBERTO

### ALBERTO · 2026-04-30T18:59:57.063Z

> manda la lista di interventi ad alberto

### NEXUS · stato:completata · 2026-04-30T19:00:00.443Z

> Alberto esegue 5 interventi e ha in agenda 8 interventi e 7 spegnimenti (non ancora eseguiti).
> 
> 07/09/2025, CONDOMINIO EDILTORRETTA - VIA TASSO 88 - PAVIA, eseguito, tecnico ALBERTO
> 20/02/2026, Controllo legionella su condomini di Nobili., programmato non ancora eseguito, tecnico ALBERTO
> 13/03/2026, BRONI - MUNICIPIO PALAZZO ARIENTI - PIAZZA GARIBALDI 12 - BRONI (PV), eseguito, tecnici VICTOR + ALBERTO
> 25/03/2026, CONDOMINIO MARGUATI - VIA CADUTI DELLA LIBERTÀ, 7/9 ang. CORSO DON ORI (APPUNTAMENTO - PERFUMO DANILO), programmato non ancora eseguito, tecnico ALBERTO
> 26/03/2026, SORBO ROSSO - VIA COLOMBO, 52 - RIVANAZZANO, eseguito, tecnici GIANLUCA + ALBERTO
> 29/03/2026, CONDOMINIO SERENO - VIA IV NOVEMBRE 2 A/B/C - NOVI LIGURE (AL), eseguito, tecnico ALBERTO
> 30/03/2026, SORBO ROSSO - VIA COLOMBO, 52 - RIVANAZZANO (SOPRALLUOGO), ritorno eseguito, tecnici GIANLUCA + ALBERTO
> 31/03/2026, CONDOMINIO ASTER - VIA DE GASPERI 32 - VOGHERA (PV) (Signor Sisti - lamenta termosifoni caldi di notte), programmato non ancora eseguito, tecnico ALBERTO
> 04/04/2026, CONDOMINIO PALLADIO - VIA DE NICOLA 29/31 - VOGHERA (PV), programmato non ancora eseguito, tecnico ALBERTO
> 09/04/2026, CAMBIO ORA, programmato non ancora eseguito, tecnici GIANLUCA + ALBERTO
> 14/04/2026, CONDOMINIO UGO GOLA - via Ugo Gola, 8/10 - Voghera (PV) 27058 (RIDUZIONE ORARIO RISCALDAMENTO), programmato non ancora eseguito, tecnico ALBERTO
> 21/04/2026, spegnimento al RSA PIA FAMIGLIA - VIA INDIPENDENZA 30 - RIVANAZZANO (PV), programmato non ancora eseguito, tecnico ALBERTO
> 21/04/2026, spegnimento al CONDOMINIO KAPPA - VIALE S. AMBROGIO 43 - PIACENZA, programmato non ancora eseguito, tecnico ALBERTO
> 21/04/2026, spegnimento al RSD RUINO - VIA PRINCIPALE 1 - POMETO (PV), programmato non ancora eseguito, tecnico ALBERTO
> 21/04/2026, spegnimento al CONDOMINIO MAGGIOCIONDOLO - FRAZIONE PIAN DEL POGGIO 8 - SANTA MARGHER, programmato non ancora eseguito, tecnico ALBERTO
> 21/04/2026, spegnimento al CONDOMINIO AVEIU - FRAZIONE PIAN 

### ALBERTO · 2026-04-30T19:00:13.166Z

> mandali via wa ad alberto

### NEXUS · stato:completata · 2026-04-30T19:00:14.984Z

> A chi mando il messaggio? Dimmi nome e cognome (es. "Andrea Malvicino"), poi il testo.

### ALBERTO · 2026-04-30T19:00:21.962Z

> alberto contardi

### NEXUS · stato:completata · 2026-04-30T19:00:22.683Z

> Cosa scrivo a alberto contardi?

### ALBERTO · 2026-04-30T19:00:31.092Z

> manda la lista di interventi

### NEXUS · stato:completata · 2026-04-30T19:00:33.463Z

> Messaggio inviato a Alberto Contardi su WhatsApp.

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-QGCm3vgSguGCiZ4UWem4.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-QGCm3vgSguGCiZ4UWem4")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "QGCm3vgSguGCiZ4UWem4: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_6i4veujvmolukk7y`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-QGCm3vgSguGCiZ4UWem4.md` con 2-3 alternative e fermati.
