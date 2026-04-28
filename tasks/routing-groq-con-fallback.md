Implementa routing NEXUS a 3 livelli: Regex → Groq → Ollama fallback.

## Architettura

### Livello 1 — Regex DIRECT_HANDLERS (istantaneo, zero costo)
Mantieni e ESPANDI tutti i regex L1 esistenti. Devono coprire il 90% dei casi:
- Interventi: "interventi di X", "che interventi ha X", "bacheca", "agenda di X"
- Email: "guarda le mail", "mail urgenti", "leggi la mail", "mail di X"
- Condomini: "abbiamo un condominio X", "indirizzo di X", "cerca condominio"
- Preventivi: "prepara preventivo", "preventivo per X"
- Scadenze: "RTI pronti", "scadenze CURIT", "scadenze F-Gas"
- Esposizione: "esposizione", "crediti", "chi ci deve"
- Campagne: "campagna walkby", "campagna"
- Saluti: "ciao", "buongiorno", "come va"
- Bug: "non funziona", "è rotto", "bug"
- Creazione intervento: "metti intervento", "programma intervento", "crea intervento"

### Livello 2 — Groq API (200-500ms, gratuito)
Se nessun regex matcha, chiama Groq:

1. Registrati su https://console.groq.com e prendi una API key gratuita
   - Piano gratuito: 14.400 richieste/giorno, 30 req/min
   - Modello: llama-3.1-70b-versatile (o llama-3.3-70b-versatile se disponibile)

2. Salva la GROQ_API_KEY nelle environment variables delle Cloud Functions:
   firebase functions:secrets:set GROQ_API_KEY

3. Nel codice nexus.js, dopo i regex L1:
```javascript
async function callGroqForIntent(userMessage) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_ROUTER },
        { role: 'user', content: userMessage }
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    })
  });
  return await response.json();
}
```

4. Il SYSTEM_PROMPT_ROUTER è lo stesso che usavi per Haiku (JSON strutturato con collega, azione, parametri)

### Livello 3 — Ollama 7b fallback (se Groq fallisce)
Se Groq dà errore (429 rate limit, 500, timeout):
```javascript
try {
  result = await callGroqForIntent(msg);
} catch(e) {
  console.log('[NEXUS] Groq fallback → Ollama 7b');
  result = await callOllamaForIntent(msg, 'qwen2.5:7b');
}
```

Ollama è su 168.119.164.92:11434, già configurato.

## IMPORTANTE
- La GROQ_API_KEY la deve creare Alberto manualmente su console.groq.com
- Se non riesci a ottenere la key: implementa tutto ma con un placeholder e istruzioni per Alberto
- NON rimuovere i regex L1 — sono la prima linea di difesa
- Se Groq E Ollama falliscono entrambi: rispondi "Non ho capito, riformula" (mai crash)

## Test
Con nexusTestInternal:
1. "interventi di Marco oggi" → regex L1 → ares (istantaneo)
2. "che indirizzo ha il condominio tonso?" → se regex matcha: memo, altrimenti Groq
3. "raccontami qualcosa" → Groq (nessun regex matcha)

Deploy functions + test + email report.
Committa con "feat(nexo): routing Groq gratuito + Ollama fallback"
