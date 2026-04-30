# Dev Request da NEXUS
Data: 2026-04-30T15:58:06.222Z
ID Firestore: eoFB6UG4fLznMyOsH3cv
User: alberto.contardi@acgclimaservice.com
Session: nx_i3r8etugmolo348h
Type: bug_from_chat

## Nota di Alberto

> perde il contesto

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T15:57:28.184Z

> metti intervento a Federico domani mattina al condominio Kristal per controllo caldaia

### NEXUS · stato:completata · 2026-04-30T15:57:32.300Z

> Creo un intervento per FEDERICO, venerdì 01/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia. Confermi?

### ALBERTO · 2026-04-30T15:57:40.563Z

> si

### NEXUS · stato:completata · 2026-04-30T15:57:41.799Z

> Fatto. Intervento creato su bacheca COSMINA: FEDERICO, venerdì 01/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia.

### ALBERTO · 2026-04-30T15:57:48.982Z

> cancellalo

### NEXUS · stato:assegnata · 2026-04-30T15:57:50.368Z

> Potresti per favore essere più specifico su cosa vuoi cancellare?

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-eoFB6UG4fLznMyOsH3cv.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-eoFB6UG4fLznMyOsH3cv")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "eoFB6UG4fLznMyOsH3cv: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_i3r8etugmolo348h`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-eoFB6UG4fLznMyOsH3cv.md` con 2-3 alternative e fermati.
