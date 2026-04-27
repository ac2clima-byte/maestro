Installa modelli veloci su Hetzner NEXO (168.119.164.92) e testa la velocità.

SSH: root@168.119.164.92 password: eN3FgqnCH4wx

1. Installa i modelli:
   ssh root@168.119.164.92 "ollama pull qwen2.5:1.5b && ollama pull qwen2.5:3b && ollama pull phi3:mini"

2. Testa velocità di ognuno con la stessa domanda di routing:
   Per ogni modello (qwen2.5:1.5b, qwen2.5:3b, phi3:mini, qwen2.5:7b):
   
   curl -s http://168.119.164.92:11434/api/generate -d '{"model":"MODELLO","prompt":"Sei un router per ACG Clima Service. Dato il messaggio, rispondi SOLO con il nome del collega giusto: ares (interventi tecnici), iris (email), memo (clienti/condomini), chronos (scadenze), preventivo (preventivi/offerte), echo (comunicazioni). Messaggio: interventi di Marco oggi","stream":false}'

3. Stampa per ogni modello:
   - Nome modello
   - Risposta
   - Tempo totale (total_duration)
   - Se la risposta è corretta (deve essere "ares")

4. Testa anche con domande diverse:
   - "guarda le mail" → deve dire "iris"
   - "prepara preventivo per De Amicis" → deve dire "preventivo"
   - "quanti RTI abbiamo pronti?" → deve dire "memo" o "chronos"

5. Stampa una tabella comparativa finale:
   Modello | Dimensione | Routing corretto | Tempo medio

Email report con la tabella.
Committa con "test: benchmark modelli Ollama per routing NEXUS"
