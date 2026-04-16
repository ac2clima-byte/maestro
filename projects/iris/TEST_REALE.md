# IRIS — Test reale end-to-end

**Data**: 2026-04-16 20:55 GMT+2
**Esito complessivo**: ✅ entrambi i test superati.

Questo documento riassume il primo test reale di IRIS contro l'infrastruttura di produzione:
1. Lettura email reali dalla casella Exchange aziendale via EWS
2. Classificazione di una email reale tramite Claude Haiku

I corpi email e gli indirizzi esterni sono **parzialmente oscurati** in questo documento: i risultati completi restano in `/tmp/iris_last_emails.json` e `/tmp/iris_classify*.json` (locali, non committati). **Nessuna email è stata modificata, segnata come letta, cancellata o ricevuta risposta** (le query usano `.all().order_by(...)[:N]`, read-only).

---

## Test 1 — Connessione EWS

**Script**: `scripts/read_last_emails.py`
**Server**: `https://remote.gruppobadano.it/ews/exchange.asmx`
**Auth**: NTLM con `alberto.contardi@acgclimaservice.com`
**TLS**: `NoVerifyHTTPAdapter` (certificato self-signed, pinning futuro)
**Query**: `account.inbox.all().order_by("-datetime_received")[:3]` (read-only)
**Esito**: ✅ 3 email lette correttamente.

| # | Mittente                                   | Oggetto                                           | Ricevuta (UTC)          |
|---|--------------------------------------------|---------------------------------------------------|-------------------------|
| 0 | `info@mpvoip.eu` (root)                    | MPVoIP PBX — Reperibilità chiamata in ingresso ACG| 2026-04-16 18:16:49 Z   |
| 1 | `Francesca.vanzillotta@guazzottienergia.com` | R: Condomini fatturazione Manutenzione          | 2026-04-16 15:38:35 Z   |
| 2 | `roberto.moraschi@cambielli.it`            | R: Complesso immobiliare                          | 2026-04-16 14:33:06 Z   |

Tempo totale query EWS: ~10s (singola Inbox, 3 messaggi).

---

## Test 2 — Classificazione con Haiku

**Script**: `scripts/classify_email.py`
**Modello**: `claude-haiku-4-5`
**Prompt**: `prompts/classifier.md` (lo stesso usato dal `Classifier.ts` in produzione)
**API**: REST `POST https://api.anthropic.com/v1/messages` (stessa shape dell'SDK)
**Esito**: ✅ JSON valido ricevuto e parsato per 2 email su 2 testate.

### Email #1 — Guazzotti (comunicazione interna)

**Input**:
- Mittente: Francesca V. (back-office Guazzotti Energia)
- Oggetto: "R: Condomini fatturazione Manutenzione"
- Thread con Sara Quagliano (ACG) + Alberto Contardi (ACG) in copia

**Classificazione**:
```json
{
  "category": "COMUNICAZIONE_INTERNA",
  "summary": "Francesca (back-office Guazzotti) chiede chiarimenti sulla fatturazione condominiale: scadenze pendenti, situazione Condomini Febbroni e Doglia (fatture mancanti a ottobre), modalità di fatturazione da applicare.",
  "entities": {
    "condominio": "Condomini Febbroni e Doglia",
    "tecnico": "Sara Quagliano, Alberto Contardi"
  },
  "suggestedAction": "RISPONDI",
  "confidence": "high",
  "reasoning": "Email interna fra colleghe di Guazzotti Energia e ACG Clima Service..."
}
```

**Uso token**: input 2538, output 247
**Valutazione qualitativa**: ✅ **corretto**. Guazzotti e ACG appartengono allo stesso gruppo, il prompt le tratta come interne; la richiesta di chiarimenti operativi giustifica `RISPONDI`. Il riassunto sintetizza bene la domanda di Francesca.

### Email #2 — Cambielli (offerta fornitore)

**Input**:
- Mittente: Roberto Moraschi (Cambielli Spa, Stradella PV)
- Oggetto: "R: Complesso immobiliare"
- Contenuto: offerta per valvole a sfera + non-ritorno in risposta a una richiesta di Alberto

**Classificazione**:
```json
{
  "category": "FATTURA_FORNITORE",
  "summary": "Roberto Moraschi da Cambielli Spa invia offerta per valvole a sfera e di non ritorno (varie DN) come risposta a richiesta di Alberto Contardi per un complesso immobiliare. Allegati contenenti le due alternative di offerta.",
  "entities": {
    "fornitore": "Cambielli Spa",
    "tecnico": "Alberto Contardi",
    "indirizzo": "Via Nazionale 82 Stradella (PV)"
  },
  "suggestedAction": "RISPONDI",
  "confidence": "high",
  "reasoning": "Email di risposta da fornitore (Cambielli Spa) con offerta su materiali..."
}
```

**Uso token**: input 2409, output 241
**Valutazione qualitativa**: ⚠️ **categoria imprecisa**. L'email è un'**offerta** da fornitore, non una fattura: `FATTURA_FORNITORE` non copre il caso. Il prompt non ha una categoria "OFFERTA_FORNITORE"; il modello ha scelto la label più vicina nella tassonomia disponibile e ha spiegato correttamente il contesto in `reasoning`. Il riassunto e le entità sono accurati. `RISPONDI` è l'azione giusta.

---

## Osservazioni e lezioni apprese

1. **Tassonomia da estendere**: manca una categoria per le **offerte commerciali da fornitori** (preventivi ricambi/materiali). Proposta: aggiungere `OFFERTA_FORNITORE` distinta da `FATTURA_FORNITORE`.
2. **Entità "inventate"**: il modello ha usato la chiave `fornitore` (non prevista dallo schema in `types/classification.ts`, che ha `cliente`). `normalizeEntities()` in `Classifier.ts` la scarta silenziosamente. Opzioni: (a) aggiungere `fornitore` allo schema, (b) istruire esplicitamente il prompt a usare solo le 7 chiavi previste.
3. **Thread con ACG in copia**: nella email Guazzotti, il mittente è esterno al gruppo ACG *sulla carta* (`@guazzottienergia.com`) ma il prompt sa che fa parte dello stesso gruppo. `COMUNICAZIONE_INTERNA` è risultato coerente con il contesto reale. ✅
4. **Confidence "high" su casi ambigui**: sia su Cambielli (offerta≠fattura) sia su Guazzotti (boundary interno/esterno) il modello ha dichiarato `high`. Aspettarsi che la confidence da sola non basti come filtro — serve comunque il feedback loop utente.
5. **Latenza + costi**: ~2.4-2.5k token input, ~240 token output per email. A 0,80€/MTok input + 4€/MTok output ≈ **0,3-0,4 centesimi per email**. Polling 30s + stima 50-100 email/giorno → ~30-40 cent/giorno in regime operativo. Accettabile.
6. **TLS self-signed**: va fatto il pinning del certificato `remote.gruppobadano.it` prima del deploy produttivo.
7. **Email #0 (MPVoIP)**: non testata ma merita nota — è una notifica automatica di chiamata in ingresso. Probabile `NEWSLETTER_SPAM` o `ALTRO`. Candidato per una futura categoria `NOTIFICA_SISTEMA` se il volume lo giustifica.

---

## Prossimi passi suggeriti

- [ ] Aggiungere `OFFERTA_FORNITORE` alla tassonomia (basso sforzo, alto valore).
- [ ] Aggiungere `fornitore` a `ExtractedEntities` o stringere il prompt sullo schema fisso.
- [ ] Test su un batch più grande (20-50 email reali) per calibrare la distribuzione di `confidence`.
- [ ] Implementare il pinning certificato EWS prima del deploy.
- [ ] Abilitare prompt caching sul system prompt (è ~3k token, alta ripetizione → risparmio significativo).
