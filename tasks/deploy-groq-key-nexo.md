Alberto ha copiato la GROQ_API_KEY nel .env corretto:
~/maestro-bridge/projects/iris/functions/.env

Ora fai:
1. Verifica che la key sia nel file:
   grep GROQ_API_KEY ~/maestro-bridge/projects/iris/functions/.env

2. Deploy functions NEXO:
   cd ~/maestro-bridge/projects/iris/functions && firebase deploy --only functions --project nexo-hub-15f2d

3. Testa Groq con nexusTestInternal:
   - "abbiamo un condominio fiordaliso?" → deve usare L2 Groq (non Ollama L3)
   - Stampa quale livello ha risposto (L1/L2/L3) e il tempo

Email report.
Committa con "deploy: Groq API key attiva su NEXO"
