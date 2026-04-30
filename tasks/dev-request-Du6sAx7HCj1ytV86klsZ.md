# Dev Request da NEXUS
Data: 2026-04-30T17:07:47.249Z
ID Firestore: Du6sAx7HCj1ytV86klsZ
User: alberto.contardi@acgclimaservice.com
Session: nx_n6t7am4omolqjrpi
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T17:06:46.445Z

> metti intervento a Federico domani mattina al condominio Kristal per controllo caldaia
>       e mettilo anche a mercoledi mattina

### NEXUS · stato:completata · 2026-04-30T17:06:51.246Z

> Creo un intervento per FEDERICO, venerdì 01/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia
>  e mettilo anche a mercoledi mattina. Confermi?

### ALBERTO · 2026-04-30T17:07:10.768Z

> si

### NEXUS · stato:completata · 2026-04-30T17:07:12.162Z

> Fatto. Intervento creato su bacheca COSMINA: FEDERICO, venerdì 01/05/2026 alle 09:00, presso U058 - CONDOMINIO KRISTAL - VIA AMATI, 1/3/5/7 - PAVIA: controllo caldaia
>  e mettilo anche a mercoledi mattina.

### ALBERTO · 2026-04-30T17:07:35.600Z

> lo hai messo anche mercoledi?

### NEXUS · stato:completata · 2026-04-30T17:07:39.973Z

> Marco mercoledì 06/05/2026 ha in agenda un intervento: CONDOMINIO STELLA A - VIA ARZANI, 10 - TORTONA (CONTROLLO SENZA ACS), programmato non ancora eseguito (co-assegnato a VICTOR).

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-Du6sAx7HCj1ytV86klsZ.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-Du6sAx7HCj1ytV86klsZ")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "Du6sAx7HCj1ytV86klsZ: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_n6t7am4omolqjrpi`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-Du6sAx7HCj1ytV86klsZ.md` con 2-3 alternative e fermati.
