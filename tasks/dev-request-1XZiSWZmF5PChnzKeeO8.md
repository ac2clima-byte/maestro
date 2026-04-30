# Dev Request da NEXUS
Data: 2026-04-30T17:29:06.204Z
ID Firestore: 1XZiSWZmF5PChnzKeeO8
User: alberto.contardi@acgclimaservice.com
Session: nx_m9pbn70xmolrcvj6
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T17:28:52.857Z

> metti intervento a Federico mercoledì mattina al Kristal per controllo caldaia e mettilo anche a giovedì mattina

### NEXUS · stato:completata · 2026-04-30T17:28:54.092Z

> Per aprire un intervento mi serve ancora: condominio o indirizzo. Esempio: "metti intervento a Federico domani mattina al condominio Kristal per controllo caldaia".

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-1XZiSWZmF5PChnzKeeO8.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-1XZiSWZmF5PChnzKeeO8")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "1XZiSWZmF5PChnzKeeO8: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_m9pbn70xmolrcvj6`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-1XZiSWZmF5PChnzKeeO8.md` con 2-3 alternative e fermati.
