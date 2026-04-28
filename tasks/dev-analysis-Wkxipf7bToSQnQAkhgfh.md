# Analisi dev-request `Wkxipf7bToSQnQAkhgfh`

**Data:** 2026-04-28
**Tipo:** bug_from_chat — duplicato semantico
**Sessione:** `nx_o7d78bqsmoih0g7k`
**Utente:** `sara.quagliano@acgclimaservice.com` (NON Alberto — primo bug da Sara)

## Sintesi

Conversazione **identica** (per causa) alla dev-request `DGGJLDIgXAPDv7lbTpzk`
(stessa Alberto, ma 1 minuto prima):

1. "che interventi ha oggi pomeriggio David?" → 2 interventi reali ✅
2. "abbiamo un condominio fiordaliso?" → "Hai 4 email urgente..." ❌

**Stessa identica root cause**:
- Manca regex L1 per query "abbiamo/c'è/esiste un X?"
- Cade su Ollama 1.5b (Anthropic balance esaurito)
- Allucinazione `iris/cerca_email_urgenti`

Vedi analisi complete:
- `tasks/dev-analysis-XwOOJMSUlMvA0sC4bGfJ.md` (proposta fix dettagliata)
- `tasks/dev-analysis-DGGJLDIgXAPDv7lbTpzk.md` (analisi specifica del bias
  Ollama verso `cerca_email_urgenti`)

## Aspetto nuovo: utente diverso

Sara Quagliano è il **primo utente diverso da Alberto** che usa NEXUS PWA
in produzione (account ACG `sara.quagliano@acgclimaservice.com`). Questo
significa:
- La PWA è in mano a più utenti operativi
- I bug routing impattano l'esperienza di chi ha appena scoperto NEXUS
- Priorità di fix elevata: una prima impressione sbagliata produce
  abbandono dello strumento

## Stato implementazione

**La fix è in corso** (commit di poco precedente questa dev-request,
session attuale Claude Code):

- ✅ `handleMemoCercaCondominio` aggiunto a `memo.js` (handler nuovo per
  query "abbiamo X?")
- ✅ DIRECT_HANDLER L1 in `nexus.js` (regex per "abbiamo/c'è/esiste un
  condominio/cliente X?")
- ✅ Fix XwOOJ #1: guardia `isCreaInterventoCommand` nel handler ARES
  crea_intervento (no più allucinazione "creo intervento per tutti")
- ✅ Fix XwOOJ #2: sanity check tecnici in `_extractTecniciCrea` (ignora
  lista LLM se ≥5 tecnici e nessuno citato)
- ✅ Fix DGGJL: riordino esempi few-shot Ollama (`cerca_email_urgenti`
  solo con keyword "urgent[ie]") + regole anti-bias esplicite
- ✅ Fix P02YSi #1: `finalContent` onesto su `in_attesa_collega`
- ✅ Fix P02YSi #2: COLLEGHI_CON_LISTENER set, niente lavagna a colleghi
  senza listener → fallback dev_request
- ✅ Strategia B (decisione utente): Anthropic Haiku rimosso dal router
  intent, Ollama qwen2.5:1.5b come unico LLM

**Test FORGE eseguiti**: la query "abbiamo un condominio fiordaliso?"
ora ritorna correttamente:

```
{
  "collega": "memo",
  "azione": "regex_match",
  "intentSource": "regex",
  "reply": "Sì, c'è B027 - CONDOMINIO FIORDALISO - VIA DEL MERLO, 3 - VOGHERA (PV).",
  "stato": "completata",
  "tookMs": 6919
}
```

Zero LLM, risposta dal CRM.

## File coinvolti

Stessi della XwOOJ + DGGJL. Niente di nuovo.

## Proposta

**Nessuna nuova proposta**: la fix è già in corso di deploy. Questa dev-
request si chiude automaticamente quando il commit Strategia B sarà
pushato e deployato.

## Effort

Già inglobato nella Strategia B (commit corrente in corso).

## Stato

Dev-request **risolta** dalla Strategia B (stesso commit). Niente
implementazione aggiuntiva richiesta.
