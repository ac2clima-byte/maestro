# Dev Request da NEXUS
Data: 2026-05-03T07:13:36.909Z
ID Firestore: wUH08DNr25fFmqIEysL2
User: alberto.contardi@acgclimaservice.com
Session: nx_gjih30timolvsvqj
Type: bug_from_chat

## Nota di Alberto

> non mantiene il  contesto anche dopo una domanda

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-05-03T07:12:57.363Z

> interventi di oggi?

### NEXUS · stato:completata · 2026-05-03T07:13:00.706Z

> Nessun intervento oggi (cercato: filtro data oggi, solo aperti).

### ALBERTO · 2026-05-03T07:13:08.448Z

> e domani?

### NEXUS · stato:assegnata · 2026-05-03T07:13:09.823Z

> Puoi specificare a cosa ti riferisci per domani?

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-wUH08DNr25fFmqIEysL2.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-wUH08DNr25fFmqIEysL2")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "wUH08DNr25fFmqIEysL2: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_gjih30timolvsvqj`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-wUH08DNr25fFmqIEysL2.md` con 2-3 alternative e fermati.
