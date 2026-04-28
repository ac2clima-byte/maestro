SOSTITUISCE il task routing-groq-con-fallback.md.

Implementa routing NEXUS a 3 livelli: Regex → Groq → phi3.5 fallback.

## Architettura

### Livello 1 — Regex DIRECT_HANDLERS (istantaneo, zero costo)
Mantieni e espandi tutti i regex L1 esistenti. Devono coprire il 90% dei casi.

### Livello 2 — Groq API (200-500ms, gratuito)
Se nessun regex matcha, chiama Groq con Llama 3.1 70B.
- Registrati su https://console.groq.com e prendi API key
- Modello: llama-3.1-70b-versatile
- Piano gratuito: 14.400 req/giorno, 30 req/min
- Salva GROQ_API_KEY in Firebase Secret Manager
- Se non riesci a creare la key: implementa tutto con placeholder e istruzioni

### Livello 3 — phi3.5 su Ollama Hetzner (fallback se Groq è down)
NON usare qwen2.5:1.5b — sbaglia 5/6 domande.
Usa phi3.5 (phi3:mini) che nel benchmark fa 4/6:
```javascript
async function callOllamaFallback(userMessage) {
  const response = await fetch('http://168.119.164.92:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'phi3:mini',  // NON qwen2.5:1.5b
      prompt: SYSTEM_PROMPT_ROUTER + '\n\nMessaggio: ' + userMessage,
      stream: false,
      options: { temperature: 0 }
    })
  });
  return await response.json();
}
```

### Ordine chiamate
```javascript
// 1. Regex L1
const regexResult = tryDirectHandlers(msg);
if (regexResult) return regexResult;

// 2. Groq
try {
  return await callGroqForIntent(msg);
} catch(e) {
  console.log('[NEXUS] Groq error, fallback phi3.5');
}

// 3. phi3.5 su Ollama
try {
  return await callOllamaFallback(msg);
} catch(e) {
  console.log('[NEXUS] Ollama error');
}

// 4. Ultimo fallback
return { risposta: "Non ho capito, riformula." };
```

## GROQ_API_KEY
Alberto deve registrarsi su https://console.groq.com.
Se la key non è disponibile: usa Ollama phi3.5 come L2 temporaneo e logga un warning.

Deploy functions + test + email report.
Committa con "feat(nexo): routing Groq + phi3.5 fallback"
