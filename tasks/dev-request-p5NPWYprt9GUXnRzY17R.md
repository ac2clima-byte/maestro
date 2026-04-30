# Dev Request da NEXUS
Data: 2026-04-30T19:21:23.804Z
ID Firestore: p5NPWYprt9GUXnRzY17R
User: alberto.contardi@acgclimaservice.com
Session: nx_s4wo78xwmolvciva
Type: bug_from_chat

## Nota di Alberto

> _(nessuna nota — vedi conversazione qui sotto)_

## Conversazione NEXUS (ultimi messaggi)

### ALBERTO · 2026-04-30T19:20:38.037Z

> manda whatsapp a Alberto: test

### NEXUS · stato:completata · 2026-04-30T19:20:40.770Z

> Messaggio inviato a Alberto Contardi su WhatsApp.

### ALBERTO · 2026-04-30T19:20:54.158Z

> mandalo ancora

### NEXUS · stato:completata · 2026-04-30T19:21:09.100Z

> Hai 50 email recenti. Ecco le prime 5:
> 
> 1. Da Calendario di Microsoft Outlook (29/04) — Pianificazione giornaliera di mercoledì 29 aprile 2026
>  Notifica automatica di agenda giornaliera da Microsoft Outlook per 29 aprile 2026. Contiene un evento Quaglini ACG alle 11:00.
> 2. Da Raffaele Nobili (28/04) — VILLAGEOKLIMA
>  Raffaele Nobili comunica che le conformità di Dovati arriveranno a breve.
> 3. Da Davide Torriglia (28/04) — R: Verifica riscaldamento condominio De Amicis
>  Davide Torriglia (3i efficientamento energetico) chiede ad Alberto di ACG di inviare l'offerta per verifica riscaldamento Condominio De Amic
> 4. Da Moraschi Roberto (28/04) — ORDINE VICTOR
>  Email generica di saluto da operatore di vendita Cambielli Spa, senza contenuto operativo o richieste specifiche.
> 5. Da Moraschi Roberto (27/04) — Perduca cond.duomo
>  Invio documento XC-STD-6344955 da Cambielli (fornitore) del 27/04/2026. Email di cortesia senza corpo testuale, contiene allegati.
> 
> Ne ho 45 altre. Dimmi "guarda le altre" per continuare oppure "leggi la 1" / "leggi la 2" per aprirne una.

## Cosa fare (Claude Code) — MODALITÀ AUTONOMA

Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,
Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end
senza chiedere conferma. Niente più "solo analisi".

Flusso normale:

1. Analizza il bug (file:riga, root cause)
2. Implementa il fix subito (regex, handler, prompt, ecc.)
3. Scrivi (opzionale) tasks/dev-analysis-p5NPWYprt9GUXnRzY17R.md — solo se utile per memoria
4. Deploya Cloud Functions / hosting modificato
5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-p5NPWYprt9GUXnRzY17R")
6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)
7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "p5NPWYprt9GUXnRzY17R: [esito]"
8. Scrivi nella chat NEXUS della sessione `nx_s4wo78xwmolvciva`:
   "Fix applicato: [cosa è cambiato]. Riprova."
   (collection nexus_chat, role=assistant, content=...)

**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:
- Modifica schema database o migrazione collection Firestore
- Cancellazione/archiviazione massiva dati produzione
- Rilascio email/WhatsApp non DRY_RUN a clienti reali
- Cambio architetturale invasivo (es. sostituzione layer completo)
- Modifica di sicurezza (rules, IAM, secret manager)

In quei casi: scrivi solo `tasks/dev-analysis-p5NPWYprt9GUXnRzY17R.md` con 2-3 alternative e fermati.
