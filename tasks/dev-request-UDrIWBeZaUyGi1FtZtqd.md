# Dev Request da NEXUS
Data: 2026-04-30T15:19:41.189Z
ID Firestore: UDrIWBeZaUyGi1FtZtqd
User: alberto.contardi@acgclimaservice.com
Session: nx_6tl4lt54molmmgn9
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T15:16:57.101Z

> FISSA UN INTERVENTO A MARCO PER DOMANI CONDOMINIO FIORDALISO PER AVVIAMENTO

### NEXUS · stato:completata · 2026-04-30T15:16:58.366Z

> Per aprire un intervento mi serve ancora: condominio o indirizzo. Esempio: "metti intervento a Federico domani mattina al condominio Kristal per controllo caldaia".

### ALBERTO · 2026-04-30T15:17:21.594Z

> metti intervento a Federico domani mattina al condominio Kristal per controllo caldaia

### NEXUS · stato:completata · 2026-04-30T15:17:25.700Z

> Creo un intervento per FEDERICO, venerdì 01/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia. Confermi?

### ALBERTO · 2026-04-30T15:17:38.003Z

> SI

### NEXUS · stato:completata · 2026-04-30T15:17:39.337Z

> Fatto. Intervento creato su bacheca COSMINA: FEDERICO, venerdì 01/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia.

### ALBERTO · 2026-04-30T15:19:33.405Z

> NON E' FISSATO

### NEXUS · stato:assegnata · 2026-04-30T15:19:34.730Z

> Potresti per favore fornire più contesto? Non capisco cosa non è fissato

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-UDrIWBeZaUyGi1FtZtqd.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-UDrIWBeZaUyGi1FtZtqd")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "UDrIWBeZaUyGi1FtZtqd: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_6tl4lt54molmmgn9`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-UDrIWBeZaUyGi1FtZtqd.md` con 2-3 alternative e fermati.
