Il loop dev-request non funziona: NEXUS salva in Firestore nexo_dev_requests ma il file tasks/dev-request-*.md non viene creato su GitHub.

Fix: MAESTRO deve pollare nexo_dev_requests e creare i file.

In maestro.mjs, aggiungi una funzione che ad ogni ciclo (o ogni 8 cicli come STATUS.md):

1. Leggi da Firestore nexo_dev_requests i documenti con status="pending" (o senza status)
2. Per ogni dev-request trovata:
   a. Crea il file tasks/dev-request-{id}.md con contenuto:
      ```
      # Dev Request da NEXUS
      Data: {timestamp}
      Richiesta: {testo della richiesta di Alberto}
      ```
   b. Aggiorna il documento Firestore con status="file_creato"
   c. git add + commit + push

3. Così MAESTRO al ciclo successivo trova il dev-request-*.md e lo manda a Claude Code in modalità analisi (come da CLAUDE.md: solo analisi, non implementazione)

4. Per leggere da Firestore in maestro.mjs usa firebase-admin (già installato per STATUS.md):
   ```javascript
   async function pollDevRequests() {
     const snap = await db.collection('nexo_dev_requests')
       .where('status', '==', 'pending')
       .limit(5).get();
     for (const doc of snap.docs) {
       const data = doc.data();
       const filename = `tasks/dev-request-${doc.id}.md`;
       const content = `# Dev Request da NEXUS\nData: ${data.createdAt || new Date().toISOString()}\nRichiesta: ${data.request || data.message || JSON.stringify(data)}\n`;
       fs.writeFileSync(filename, content);
       await doc.ref.update({ status: 'file_creato' });
       execSync('git add ' + filename);
     }
     if (!snap.empty) {
       execSync('git commit -m "dev-request da NEXUS" && git push origin main', { stdio: 'pipe' });
     }
   }
   ```

5. Chiama pollDevRequests() ogni 8 cicli (insieme a writeAndPushStatusReport)

6. Testa: verifica che la dev-request "report mensile non parsifica i mesi" appaia come file nel repo

7. Committa con "feat(maestro): poll dev-requests da Firestore → GitHub"
