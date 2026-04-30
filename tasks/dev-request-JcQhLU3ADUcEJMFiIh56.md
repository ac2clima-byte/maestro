# Dev Request da NEXUS
Data: 2026-04-30T19:22:34.371Z
ID Firestore: JcQhLU3ADUcEJMFiIh56
User: alberto.contardi@acgclimaservice.com
Session: nx_xaao9xfumolveeu1
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T19:22:01.115Z

> Stato della Suite

### NEXUS · stato:completata · 2026-04-30T19:22:03.096Z

> La suite è congestionata (punteggio 40/100). 125 email indicizzate, 40 senza risposta da più di due giorni, 200 messaggi pending sulla lavagna. Vuoi che proviamo a ripulire i messaggi pending?

### ALBERTO · 2026-04-30T19:22:15.222Z

> si

### NEXUS · stato:assegnata · 2026-04-30T19:22:16.888Z

> Certo, dimmi pure cosa ti serve.

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-JcQhLU3ADUcEJMFiIh56.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-JcQhLU3ADUcEJMFiIh56")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "JcQhLU3ADUcEJMFiIh56: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_xaao9xfumolveeu1`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-JcQhLU3ADUcEJMFiIh56.md` con 2-3 alternative e fermati.
