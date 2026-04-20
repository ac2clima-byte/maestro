Implementa SOLO sendWhatsApp per ECHO. Un'azione, funzionante.

STEP ESATTI:

1. Cerca le credenziali Waha:
   grep -r "WAHA\|waha" /mnt/c/HERMES/.env ~/acg_suite/ ~/maestro-bridge/ 2>/dev/null | head -20
   
   Se non trovi nulla, cerca come COSMINA Inbox si connette:
   find ~/acg_suite/ -name "*.js" -o -name "*.py" | xargs grep -l "waha\|WAHA" 2>/dev/null

2. Una volta trovato URL e API key Waha, implementa in projects/echo/src/actions/index.ts la funzione sendWhatsApp:

   async function sendWhatsApp(to: string, body: string): Promise<void> {
     const wahaUrl = process.env.WAHA_API_URL; // es: http://xxx:3000
     const chatId = to.startsWith("+") ? to.replace("+","") + "@c.us" : to + "@c.us";
     
     const response = await fetch(`${wahaUrl}/api/sendText`, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         chatId,
         text: body,
         session: "default"
       })
     });
     
     if (!response.ok) throw new Error(`Waha error: ${response.status}`);
   }

3. Aggiorna projects/echo/.env con le credenziali trovate

4. Testa: esegui uno script Node che chiama sendWhatsApp("3931XXXXXXX", "Test ECHO NEXO") — usa il numero di Alberto che trovi in .env o nel codice HERMES

5. Stampa a console se ha funzionato o no

6. Se Waha non è raggiungibile (server Hetzner spento?), stampa l'errore e vai avanti

7. Committa con "feat(echo): sendWhatsApp implementato con Waha"
