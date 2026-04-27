Alberto conferma: procedi con OPZIONE A dalla proposta di Claude Code.

1. Espandi DIRECT_HANDLERS regex per coprire più pattern frequenti
2. Ollama qwen2.5:7b come fallback quando Haiku dà errore (400/429/balance esaurito)
3. Haiku resta il router principale per le domande complesse
4. Header X-Nexo-Key sulla request Ollama

NON sostituire Haiku — aggiungi Ollama come fallback.

Deploy + test + email report.
Committa con "feat(nexo): Ollama 7b fallback + espansione regex routing"
