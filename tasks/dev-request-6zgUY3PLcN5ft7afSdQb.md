# Dev Request da NEXUS
Data: 2026-04-30T16:00:25.897Z
ID Firestore: 6zgUY3PLcN5ft7afSdQb
User: alberto.contardi@acgclimaservice.com
Session: nx_n49dfcaamolo4ged
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T15:59:12.861Z

> che interventi ha marco lunedi?

### NEXUS · stato:completata · 2026-04-30T15:59:17.024Z

> Marco lunedì 27/04/2026 non ha interventi (cercato: 409 card totali, filtro data lunedì 27/04/2026, solo aperti).

### ALBERTO · 2026-04-30T15:59:59.092Z

> se ti chiedo lunedi intendo lunedi prossimo

### NEXUS · stato:assegnata · 2026-04-30T16:00:00.249Z

> Ok, ho capito, se chiedi lunedì senza specificare la data, intendo sempre lunedì prossimo

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-6zgUY3PLcN5ft7afSdQb.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-6zgUY3PLcN5ft7afSdQb")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "6zgUY3PLcN5ft7afSdQb: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_n49dfcaamolo4ged`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-6zgUY3PLcN5ft7afSdQb.md` con 2-3 alternative e fermati.
