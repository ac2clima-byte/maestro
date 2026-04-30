# Dev Analysis — wvZCv5sxPPZUBFBt9pLT (mandami le mail su wa)

## Bug

Conversazione:
- Alberto: "mandami le mail su wa"
- NEXUS: chiede destinatario
- Alberto: "io sono Alberto Contardi"
- NEXUS: "Non trovo 'io sono Alberto'..."

Due problemi distinti:
1. **"mandami"** non viene riconosciuto come dest = utente loggato (Alberto)
2. **"io sono X"** viene parsato come dest = "io sono" + body = "Alberto Contardi"

E un terzo, architetturale:
3. **"le mail su wa"** è un compound intent: IRIS legge le email urgenti → ECHO le formatta in WA. NEXUS oggi non ha orchestrazione multi-collega in un turno (vedi dev-request ORZvCQkiUMwxOSx6SRkR già marcata come `analysis_only`).

## Proposte

### Opzione A — Solo fix parser dest (chirurgico, ~15 righe)

1. In `handleEchoWhatsApp` e `tryInterceptEchoPending`: riconoscere "mandami / inviami / scrivimi / manda a me / fammelo arrivare" → dest = `ctx.userId` mappato al nome interno via `cosmina_contatti_interni.email_personale|email_lavoro`.
2. Riconoscere "io sono X" / "sono io X" / "il destinatario sono io" → dest = `ctx.userId` mappato.
3. Migliorare parser "io sono Alberto Contardi": se i primi 2 token sono "io sono" → skip, prendi il resto come dest.

**Pro**: Risolve i 2 problemi di parsing. Compatibile con orchestrazione futura.
**Contro**: Non risolve il caso compound: l'utente ottiene "Cosa scrivo a Alberto Contardi?" e deve dettare il testo a mano. Per "mandami le mail su wa" serve l'opzione B.

### Opzione B — Compound intent IRIS+ECHO (cambio architetturale)

Estendere `DIRECT_HANDLERS` con un workflow dedicato `wa_email_digest`:
1. Riconosce pattern "manda(mi)? (le )?(mie )?(email|mail|posta) (su|via|in|tramite) (wa|whatsapp)"
2. Chiama `runDigestMattutino()` (esiste già, in `echo-digest.js`) per generare il riepilogo email
3. Risolve dest da `ctx.userId` (se "mandami") o esplicito
4. `handleEchoWhatsApp({to: dest, body: digest})`

**Pro**: copre il caso d'uso reale ("voglio leggermi le email su wa").
**Contro**: dipende dal fix Opzione A per dest = sé. Codice duplicato con `echo-digest.js` se non si refactora bene.

### Opzione C — Orchestratore generico Groq

Come dev-request ORZvCQkiUMwxOSx6SRkR opzione B: estendere il prompt Groq per emettere `azioni_multiple[]`. Risolve TUTTI i compound intent futuri ma è invasivo e rischia allucinazioni.

## Raccomandazione

**A + B insieme** (~50 righe):
- A è prerequisito (serve sempre, anche per "mandami il preventivo")
- B copre il caso pratico oggi

Il benchmark LLM appena fatto mostra che per i compound intent **gpt-oss-120b** funziona meglio di llama-3.3-70b. Una possibile evoluzione futura è il routing 2-livelli (llama veloce per casi semplici, gpt-oss-120b per compound) — vedi sessione 2026-04-30, sezione "benchmark".

## Attesa input

Alberto, scegli A/B/C/A+B e procedo.

Collegata: ORZvCQkiUMwxOSx6SRkR (compound intent ARES+ECHO, stessa famiglia).
