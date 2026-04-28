Implementa routing NEXUS a 3 livelli: Regex → Groq → Ollama fallback.

## Livello 1 — Regex DIRECT_HANDLERS (istantaneo, zero costo)
Mantieni e ESPANDI tutti i regex attuali. Devono coprire il 90% dei casi:
- interventi (con/senza tecnico, data, città)
- email (guarda mail, leggi, urgenti, allegati)
- condomini (abbiamo/c'è/esiste, indirizzo, cerca)
- preventivi (prepara, lista, emessi)
- saluti, bug report, grazie
- scadenze, RTI, CURIT, F-Gas
- campagne, walkby, esposizione
- crea intervento (metti/programma/aggiungi)

## Livello 2 — Groq API gratuita (200-500ms, zero costo)
Se nessun regex matcha, chiama Groq:
```javascript
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer GROQ_API_KEY'
  },
  body: JSON.stringify({
    model: 'llama-3.1-70b-versatile',
    messages: [
      { role: 'system', content: 'Sei il router NEXUS di ACG Clima Service...[system prompt con few-shot examples]' },
      { role: 'user', content: userMessage }
    ],
    temperature: 0,
    max_tokens: 100,
    response_format: { type: 'json_object' }
  })
});
```

Per ottenere la API key Groq:
1. Vai su https://console.groq.com/keys
2. Crea una API key gratuita
3. Salvala in Secret Manager Firebase o in .env
4. Per ora usa una key di test: cerca su Google "groq free api key" e registrati

IMPORTANTE: prima di implementare, verifica che Groq funzioni. Se non riesci a ottenere una API key, stampa le istruzioni per Alberto e fermati.

## Livello 3 — Ollama 7b fallback (4-12s, zero costo)
Se Groq fallisce (rate limit, timeout, errore):
```javascript
const response = await fetch('http://168.119.164.92:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Nexo-Key': 'nexo-forge-2026' },
  body: JSON.stringify({
    model: 'qwen2.5:7b',
    prompt: '[stesso prompt di Groq]',
    stream: false,
    options: { temperature: 0, num_predict: 100 }
  })
});
```

## Catena completa
```
messaggio utente
    → Regex L1 matcha? → handler diretto (0ms)
    → Groq L2 matcha? → handler da intent JSON (200-500ms)
    → Ollama L3 fallback → handler da intent (4-12s)
    → Nessuno → "Non ho capito, riformula"
```

## Test
Testa con i 6 prompt del benchmark:
1. "abbiamo un condominio fiordaliso?" → memo
2. "che indirizzo ha condominio via tonso 3" → memo
3. "non funziona la dettatura vocale" → dev_request
4. "trova impianto targa PH4QC34139879603" → dikea
5. "che interventi ha david oggi" → ares
6. "raccontami qualcosa" → saluto/generico

Deploy + test + email report con tabella comparativa tempi.
Committa con "feat(nexo): routing Groq gratuito + Ollama 7b fallback"
