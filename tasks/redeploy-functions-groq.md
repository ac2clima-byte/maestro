La GROQ_API_KEY è stata salvata nel .env delle functions. Serve re-deploy per attivarla.

1. Deploy functions:
   cd ~/acg_suite/COSMINA/firebase && ./deploy.sh functions

   Oppure:
   cd functions && firebase deploy --only functions:nexusChat,functions:nexusTestInternal --project nexo-hub-15f2d

2. Verifica che Groq risponda testando con nexusTestInternal:
   - "abbiamo un condominio fiordaliso?" → deve usare Groq L2 (non Ollama)
   - Verifica nei log: "L2 Groq" nel log della Cloud Function

3. Testa tutti i 6 prompt del benchmark e stampa per ognuno quale livello ha risposto (L1/L2/L3)

Email report con risultati.
Committa con "deploy: attiva Groq API key nelle functions"
