Sostituisci TUTTE le chiamate Haiku API nel routing NEXUS con Ollama su Hetzner NEXO (168.119.164.92:11434).

## Architettura a 3 livelli

### Livello 1 — Regex (istantaneo, zero costo)
Già implementato in DIRECT_HANDLERS di nexus.js. Copre:
- "interventi di X" → ares
- "guarda le mail" → iris
- "prepara preventivo" → preventivo
- "campagna walkby" → memo
- etc.
Aggiungi regex per TUTTI i pattern frequenti che oggi passano a Haiku.

### Livello 2 — Qwen2.5:1.5b su Ollama (0.45s, zero costo)
Se nessun regex matcha, chiama Ollama:
```javascript
const response = await fetch('http://168.119.164.92:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen2.5:1.5b',
    prompt: `Sei un router per ACG Clima Service. Rispondi SOLO con il nome del collega:
ares (interventi tecnici, bacheca), iris (email), memo (clienti/condomini/CRM),
chronos (scadenze/RTI), preventivo (preventivi/offerte), echo (comunicazioni),
charta (fatture/contabilità), dikea (normativa/CURIT/F-Gas), delphi (analisi dati).

Esempi:
- interventi di Marco oggi → ares
- guarda le mail → iris
- quanti RTI abbiamo pronti? → chronos
- prepara preventivo per De Amicis → preventivo
- esposizione crediti → charta
- scadenza F-Gas → dikea

Messaggio: ${userMessage}`,
    stream: false,
    options: { temperature: 0, num_predict: 10 }
  })
});
```

### Livello 3 — Qwen2.5:7b fallback (per task complessi)
Se il Collega è "preventivo" e serve interpretare frasi complesse (IVA, modifica voci, approvazione non parsata dai regex), usa qwen2.5:7b:
```javascript
model: 'qwen2.5:7b'
```

## Cosa rimuovere
- TUTTE le chiamate a Anthropic Haiku API nel routing (nexus.js)
- TUTTE le chiamate a Haiku nel fallback preventivo (preventivo.js)
- Se c'è un ANTHROPIC_API_KEY usato per il routing, non serve più

## Cosa NON rimuovere
- Le chiamate Haiku per i test FORGE (nexusTestInternal) possono restare per ora
- L'ANTHROPIC_API_KEY serve ancora se usata altrove (non per il routing)

## Firewall Ollama
Mentre sei connesso a 168.119.164.92, configura ufw:
```bash
ssh root@168.119.164.92 "ufw allow ssh && ufw allow from 0.0.0.0/0 to any port 3000 && ufw deny 11434 && ufw --force enable"
```
POI aggiungi SOLO gli IP delle Cloud Functions Google:
- Per ora lascia aperto 11434 ma aggiungi un header custom X-Nexo-Key che il codice NEXUS manda e Ollama non verifica (placeholder per auth futura)

NOTA: le Cloud Functions Google non hanno IP fisso, quindi il firewall per IP non funziona. Meglio usare un header segreto + rate limiting.

## Test
1. "interventi di Marco oggi" → regex diretto → ares (0ms)
2. "quanti RTI abbiamo pronti?" → Ollama 1.5b → chronos (~0.5s)
3. "iva 0 reverse charge" nel flusso preventivo → Ollama 7b fallback

Deploy functions + test + email report.
Committa con "feat(nexo): routing Ollama locale — zero costi API Haiku"
