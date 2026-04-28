Salva la Groq API key nel .env delle Cloud Functions di nexo-hub-15f2d.

Alberto ha creato la key su console.groq.com. La key inizia con "gsk_jNN8m..." (non la scrivo per intero qui per sicurezza).

1. Chiedi ad Alberto di eseguire questo comando sul suo PC:
   cd ~/acg_suite/COSMINA/firebase/functions
   echo "GROQ_API_KEY=<key completa>" >> .env

2. Oppure salvala via Firebase Secret Manager:
   firebase functions:secrets:set GROQ_API_KEY --project nexo-hub-15f2d

3. La key è già nota a Claude Chat — verrà passata separatamente.

Per ora, scrivi la key direttamente nel .env delle functions senza committarla su git.
Aggiungi GROQ_API_KEY al .gitignore se non c'è.

Committa con "feat(nexo): predisposizione Groq API key"
