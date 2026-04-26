Claude Code deve scrivere il suo stato su un file STATUS.md nel repo e pusharlo ad ogni cambio fase.

In maestro.mjs, la funzione updateStatus (quella che già scrive su Firestore) deve ANCHE:

1. Scrivere il file STATUS.md nella root del repo:

```javascript
const fs = require('fs');
const { execSync } = require('child_process');

async function updateStatus(fase, dettagli) {
  // Firestore (già implementato)
  // ...
  
  // GitHub STATUS.md
  const status = `# Claude Code Status
Fase: ${fase}
Task: ${dettagli.task || 'nessuno'}
Dettagli: ${dettagli.msg || ''}
Timestamp: ${new Date().toISOString()}
Uptime: ${Math.round(process.uptime())}s
`;
  fs.writeFileSync('STATUS.md', status);
  try {
    execSync('git add STATUS.md && git commit -m "status: ' + fase + '" --allow-empty && git push origin main', { stdio: 'pipe', timeout: 10000 });
  } catch(e) {
    // ignore push errors, non bloccare il flusso
  }
}
```

2. NON pushare lo status ad ogni polling (troppi commit). Pusha SOLO quando la fase CAMBIA:
   - idle → found_task: pusha
   - found_task → sending_to_code: pusha
   - sending_to_code → waiting_result: pusha
   - waiting_result → pushing_result: pusha
   - pushing_result → idle: pusha
   - idle → idle: NON pushare

3. Aggiungi una variabile lastFase per tracciare i cambiamenti:
```javascript
let lastFase = '';
async function updateStatus(fase, dettagli) {
  if (fase === lastFase && fase === 'idle') return; // skip idle ripetuti
  lastFase = fase;
  // scrivi Firestore + STATUS.md + push
}
```

4. Committa con "feat(maestro): STATUS.md su GitHub per monitoring Claude Chat"
