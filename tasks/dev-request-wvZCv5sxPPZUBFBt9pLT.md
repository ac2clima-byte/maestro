# Dev Request da NEXUS
Data: 2026-04-30T18:45:49.069Z
ID Firestore: wvZCv5sxPPZUBFBt9pLT
User: alberto.contardi@acgclimaservice.com
Session: nx_250cy4s6molu31we
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T18:45:10.095Z

> Quante email urgenti ho?

### NEXUS · stato:completata · 2026-04-30T18:45:12.348Z

> Hai 4 email urgente. La prima è da Acquisti (A.Nannetti S.r.l.), riguarda a. nannetti & c. comunica revoca di incarico come terzo responsabile. allegato non leggibile in questo contesto. richiesta conferma ricezione. Vuoi che te la legga?

### ALBERTO · 2026-04-30T18:45:24.934Z

> mandami le mail su wa

### NEXUS · stato:completata · 2026-04-30T18:45:26.550Z

> A chi mando il messaggio? Dimmi nome e cognome (es. "Andrea Malvicino"), poi il testo.

### ALBERTO · 2026-04-30T18:45:39.022Z

> io sono Alberto Contardi

### NEXUS · stato:completata · 2026-04-30T18:45:41.096Z

> Non trovo "io sono Alberto" né nella rubrica interna (cosmina_contatti_interni) né nei clienti (cosmina_contatti_clienti).
> 
> Verifica che il nome sia corretto e che il contatto abbia un telefono popolato.

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-wvZCv5sxPPZUBFBt9pLT.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-wvZCv5sxPPZUBFBt9pLT")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "wvZCv5sxPPZUBFBt9pLT: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_250cy4s6molu31we`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-wvZCv5sxPPZUBFBt9pLT.md` con 2-3 alternative e fermati.
