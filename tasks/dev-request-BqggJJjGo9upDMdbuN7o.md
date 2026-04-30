# Dev Request da NEXUS
Data: 2026-04-30T17:31:46.806Z
ID Firestore: BqggJJjGo9upDMdbuN7o
User: alberto.contardi@acgclimaservice.com
Session: nx_y7ob8i3emolrg4xc
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T17:31:22.065Z

> metti intervento a Federico mercoledì mattina al condominio Kristal per controllo caldaia e mettilo anche a giovedì mattina

### NEXUS · stato:completata · 2026-04-30T17:31:25.783Z

> Creo 2 interventi per FEDERICO, mercoledì 06/05/2026 alle 09:00 e giovedì 07/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia. Confermi?

### ALBERTO · 2026-04-30T17:31:28.382Z

> si

### NEXUS · stato:completata · 2026-04-30T17:31:30.267Z

> Fatto. 2 interventi creati su bacheca COSMINA: FEDERICO, mercoledì 06/05/2026 alle 09:00 e giovedì 07/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia.

### ALBERTO · 2026-04-30T17:31:38.866Z

> cancellali

### NEXUS · stato:assegnata · 2026-04-30T17:31:40.311Z

> Non capisco cosa vuoi cancellare, puoi essere più specifico?

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-BqggJJjGo9upDMdbuN7o.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-BqggJJjGo9upDMdbuN7o")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "BqggJJjGo9upDMdbuN7o: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_y7ob8i3emolrg4xc`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-BqggJJjGo9upDMdbuN7o.md` con 2-3 alternative e fermati.
