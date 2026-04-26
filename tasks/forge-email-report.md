Claude Code deve mandare email di report a ac2clima@gmail.com dopo ogni task completato.

## Implementazione

In maestro.mjs, dopo che un task è completato (dopo il push del risultato), manda una email:

1. Usa il poller EWS (exchangelib) che già funziona per IRIS, oppure usa nodemailer con Gmail SMTP, oppure crea una Cloud Function che manda email.

2. La soluzione più semplice: crea una Cloud Function "nexoSendReport" (HTTP POST, no auth) che:
   - Riceve: { to, subject, body }
   - Manda email usando Gmail API o nodemailer
   - to: "ac2clima@gmail.com"

3. In alternativa più semplice: usa la Cloud Function EWS che già esiste per mandare email dal server Exchange di ACG:
   - Da: alberto.contardi@acgclimaservice.com
   - A: ac2clima@gmail.com
   - Oggetto: "NEXO FORGE: [nome-task] [PASS/FAIL]"
   - Corpo: riassunto del risultato

4. In maestro.mjs, dopo il push del risultato:
```javascript
async function sendForgeReport(taskName, result, details) {
  try {
    const url = 'https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoSendReport';
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'ac2clima@gmail.com',
        subject: `NEXO FORGE: ${taskName} ${result}`,
        body: `Task: ${taskName}\nRisultato: ${result}\nTimestamp: ${new Date().toISOString()}\n\nDettagli:\n${details}`
      })
    });
    console.log(`[FORGE] Report email inviata per ${taskName}`);
  } catch(e) {
    console.log(`[FORGE] Errore invio email: ${e.message}`);
  }
}
```

5. Chiama sendForgeReport dopo ogni task completato e dopo ogni ciclo FORGE test

6. NON mandare email durante i test — solo report finali

7. Deploy la Cloud Function nexoSendReport
8. Testa: manda una email di test a ac2clima@gmail.com con oggetto "NEXO FORGE: test-email PASS"
9. Committa con "feat(maestro): report email a Gmail dopo ogni task"
