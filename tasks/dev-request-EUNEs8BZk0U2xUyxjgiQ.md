# Dev Request da NEXUS
Data: 2026-04-30T19:04:04.232Z
ID Firestore: EUNEs8BZk0U2xUyxjgiQ
User: alberto.contardi@acgclimaservice.com
Session: nx_aim98clbmoluqb7g
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T19:03:27.291Z

> dimmi tutto quello che sai su alberto contardi

### NEXUS · stato:completata · 2026-04-30T19:03:32.307Z

> Non trovo nulla su "nx_aim98clbmoluqb7g" nel CRM, negli impianti, nella bacheca interventi, negli RTI Guazzotti né nelle ultime 125 email indicizzate. Forse è una persona e non un condominio. Vuoi che cerchi nei contatti rubrica?

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-EUNEs8BZk0U2xUyxjgiQ.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-EUNEs8BZk0U2xUyxjgiQ")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "EUNEs8BZk0U2xUyxjgiQ: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_aim98clbmoluqb7g`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-EUNEs8BZk0U2xUyxjgiQ.md` con 2-3 alternative e fermati.
