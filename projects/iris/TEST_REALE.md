# IRIS — Test reale end-to-end

**Ultimo run**: 2026-04-17 09:13 GMT+2 (Fase 6 — collegamento dati reali)
**Esito complessivo**: ✅ entrambi i test superati.

Questo documento riporta il test reale di IRIS contro l'infrastruttura di produzione:
1. Lettura email reali dalla casella Exchange aziendale via EWS (`remote.gruppobadano.it`)
2. Classificazione di una email reale tramite Claude Haiku 4.5

**Garanzia read-only**: la query EWS usa `account.inbox.all().order_by("-datetime_received")[:N]`. Non viene letto/segnato/cancellato/risposto nulla. I body completi restano in `/tmp/iris_last_emails.json` e `/tmp/iris_classify_0.json` (locali, fuori da git).

---

## Setup

`.env` IRIS popolato leggendo da `/mnt/c/HERMES/.env` (chiavi `OUTLOOK_USER`, `OUTLOOK_PASSWORD`, `ANTHROPIC_API_KEY`):

| Variabile             | Valore                                                |
|-----------------------|-------------------------------------------------------|
| `EWS_URL`             | `https://remote.gruppobadano.it/ews/exchange.asmx`    |
| `EWS_USERNAME`        | `alberto.contardi@acgclimaservice.com`                |
| `EWS_PASSWORD`        | (da HERMES `OUTLOOK_PASSWORD`, redatto)               |
| `ANTHROPIC_API_KEY`   | (da HERMES `ANTHROPIC_API_KEY`, redatto)              |
| `FIREBASE_PROJECT_ID` | `nexo-hub-15f2d`                                      |
| `POLL_INTERVAL_MS`    | `30000`                                               |

`.env` confermato presente in `.gitignore` → **non committato**.

---

## Test 1 — Connessione EWS (read-only)

**Comando**: `python3 scripts/read_last_emails.py 3`
**Server**: `https://remote.gruppobadano.it/ews/exchange.asmx`
**Auth**: NTLM con principal `alberto.contardi@acgclimaservice.com`
**TLS**: `NoVerifyHTTPAdapter` (cert self-signed; pinning rimandato)
**Esito**: ✅ 3 email lette, exit code 0, nessun errore.

| # | Mittente                                        | Oggetto                                                          | Ricevuta (UTC)        | Allegati |
|---|-------------------------------------------------|------------------------------------------------------------------|-----------------------|----------|
| 0 | Massimo Poggi `<massimo.poggi@guazzottienergia.com>` | PRESCRIZIONE FATTURE DI MANUTENZIONE - ARTICOLO INTERESSANTE | 2026-04-17 06:08:51Z  | no       |
| 1 | Alessandro Lombardi `<alessandro.lombardi@guazzottienergia.com>` | I: Relazione controllo servocomando                              | 2026-04-17 06:02:20Z  | sì       |
| 2 | Alessandro Lombardi `<alessandro.lombardi@guazzottienergia.com>` | I: Libretto Turati 9                                             | 2026-04-17 05:59:19Z  | sì       |

Tutte e 3 risultano `is_read=True` (già lette prima del test → confermato che la query non altera lo stato).

---

## Test 2 — Classificazione con Claude Haiku 4.5

**Comando**: `python3 scripts/classify_email.py 0` (email #0 sopra)
**Modello**: `claude-haiku-4-5`
**Prompt**: `prompts/classifier.md` (stesso usato dal `Classifier.ts` di produzione)
**API**: `POST https://api.anthropic.com/v1/messages` (REST diretto, no SDK)
**Esito**: ✅ JSON valido restituito e parsato.

### Email selezionata
- **Mittente**: `massimo.poggi@guazzottienergia.com`
- **Oggetto**: "PRESCRIZIONE FATTURE DI MANUTENZIONE - ARTICOLO INTERESSANTE"
- **Ricevuta**: 2026-04-17 06:08:51Z

### Risultato classificazione

```json
{
  "category": "COMUNICAZIONE_INTERNA",
  "summary": "Massimo Poggi (Direttore commerciale Guazzotti) condivide un articolo su prescrizione fatture commerciali con colleghi.",
  "entities": {
    "tecnico": "Massimo Poggi"
  },
  "suggestedAction": "ARCHIVIA",
  "confidence": "high",
  "reasoning": "Email interna da un dirigente Guazzotti TEC (consociata di ACG Clima Service) che condivide risorsa informativa su tema amministrativo-legale (prescrizione fatture). Non richiede azione operativa immediata.",
  "sentiment": "neutro",
  "sentimentReason": "Tono informale e professionale, semplice condivisione di contenuto senza carica emotiva."
}
```

**Token uso**: input 2664, output 220, no cache hit.
**Stima costo**: ~0.0024 € (≈ 0,24 cent) per classificazione.

**Valutazione qualitativa**: ✅ corretto.
- `COMUNICAZIONE_INTERNA` è la label giusta (Guazzotti è consociata, il prompt la tratta come interna).
- `ARCHIVIA` è coerente: condivisione informativa, nessuna azione richiesta.
- L'unica entità estratta (`tecnico: Massimo Poggi`) è plausibile anche se "tecnico" non è il ruolo esatto di Poggi (Direttore commerciale): il modello ha usato la chiave più vicina dello schema fisso. Conferma il punto già notato nel test precedente — utile aggiungere `mittente_ruolo` o usare `cliente`/`fornitore` come categorie più espressive.
- `confidence=high` plausibile.

---

## Riepilogo Fase 6

| Step                                          | Stato | Note                                                                 |
|-----------------------------------------------|-------|----------------------------------------------------------------------|
| `.env` IRIS popolato da HERMES                | ✅     | EWS + Anthropic + Firebase project ID                                |
| `.env` escluso da git                         | ✅     | già in `.gitignore`                                                  |
| Test EWS reale (3 email, read-only)           | ✅     | `scripts/read_last_emails.py 3` — exit 0                             |
| Test classificazione reale (Haiku)            | ✅     | `scripts/classify_email.py 0` — JSON valido                          |
| Nessuna email modificata                      | ✅     | `is_read` invariato, nessuna `MarkAsRead`/`Reply`/`Move`             |
| Doc aggiornato                                | ✅     | questo file                                                          |
| Commit `test(iris): first real EWS + classification test` | 🔜 | next step                                                |

---

## Storico — Run precedente (2026-04-16 20:55 GMT+2)

Primo test reale eseguito ieri sera, **anch'esso ✅**. Tre email diverse (MPVoIP, Vanzillotta, Moraschi/Cambielli) classificate correttamente con eccezione marginale: "OFFERTA_FORNITORE" mancante in tassonomia → modello ha ripiegato su `FATTURA_FORNITORE`. Da affrontare nella prossima iterazione del prompt.

Lezioni apprese ancora valide:
1. **Tassonomia da estendere**: `OFFERTA_FORNITORE` separata da `FATTURA_FORNITORE`.
2. **Schema entità**: il modello inventa chiavi (es. `fornitore`); valutare se aggiungerle a `ExtractedEntities` o restringere il prompt.
3. **TLS self-signed**: pinning del cert `remote.gruppobadano.it` prima del deploy.
4. **Prompt caching**: il system prompt è ~2.5k token, alta ripetizione → abilitare cache 5m porta risparmio significativo a regime.
5. **Costo regime**: ~0.3-0.4 cent/email × ~50-100 email/giorno = ~30-40 cent/giorno. Sostenibile.
