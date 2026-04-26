MAESTRO deve scrivere un file STATUS.md nel repo e pusharlo ad ogni ciclo di polling.

In maestro.mjs, alla fine di ogni ciclo (dopo il git pull e il check dei task):

1. Chiama curl per leggere lo stato da Firestore:
   const status = execSync('curl -s https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/codeStatus').toString();

2. Scrivi STATUS.md nella root del repo:
   ```
   # NEXO Code Status
   Ultimo aggiornamento: [timestamp]
   
   [contenuto JSON del codeStatus formattato]
   
   ## Task pending
   [lista task senza risultato]
   
   ## Ultimi 5 commit
   [git log --oneline -5]
   ```

3. git add STATUS.md && git commit -m "status update" && git push
   - Ma fallo solo ogni 2 minuti (non ogni 15 secondi) per non spammare commit
   - Usa un contatore: if (ciclo % 8 === 0) scrivi status

4. Così Claude Chat fa git pull e legge STATUS.md per sapere cosa sta succedendo

Committa con "feat(maestro): STATUS.md auto-aggiornato ogni 2 minuti"
