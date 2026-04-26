PROBLEMA CRITICO: il preventivo inventa ancora i prezzi. NON deve inventare nulla. Deve CHIEDERE ad Alberto le voci e gli importi.

Apri handlers/preventivo.js e trova la funzione runPreventivoWorkflow (o equivalente).

FIX ESATTO:

1. Trova dove viene chiamato Claude Sonnet per generare le voci del preventivo. RIMUOVI quella chiamata.

2. Dopo aver raccolto i dati (intestatario + condominio), il workflow deve FERMARSI e rispondere:

```javascript
// INVECE di generare voci con Sonnet, chiedi ad Alberto
const risposta = `Ho i dati per il preventivo:
Intestatario: ${nomeAzienda}, P.IVA ${piva}, ${indirizzoAzienda}
Condominio: ${nomeCondominio}, ${indirizzoCondominio}

Dimmi le voci e gli importi che vuoi inserire. Esempio:
"sopralluogo 200, relazione tecnica 150, verifica impianto 300"`;

// Salva lo stato "in_attesa_voci" nel documento preventivo in Firestore
// così al prossimo messaggio di Alberto, il sistema sa che deve parsare le voci
await db.collection('nexo_preventivi_pending').doc(sessionId).set({
  stato: 'attesa_voci',
  intestatario: { nome: nomeAzienda, piva, indirizzo: indirizzoAzienda },
  condominio: { nome: nomeCondominio, indirizzo: indirizzoCondominio },
  createdAt: FieldValue.serverTimestamp()
});

return { text: risposta, collega: 'preventivo' };
```

3. Aggiungi un intercept per parsare le voci quando Alberto risponde:
   - Controlla se c'è un preventivo in stato "attesa_voci" per questa sessione
   - Se sì: parsa il messaggio di Alberto per estrarre voci e importi
   - Pattern da matchare: "descrizione importo" separati da virgola o nuova riga
   - Calcola totale imponibile + IVA 22%
   - Mostra riepilogo: "Preventivo €XXX + IVA = €YYY. Lo genero in PDF?"
   - Aggiorna stato a "attesa_approvazione"

4. NON generare MAI prezzi con Sonnet/Haiku. I prezzi li decide SOLO Alberto.

5. Testa con Playwright via nexusTestInternal:
   - Step 1: "prepara preventivo per De Amicis intestato a 3i"
     → DEVE rispondere chiedendo le voci, NON con un preventivo già pronto
   - Step 2: "sopralluogo 200, relazione tecnica 150, verifica impianto 300"  
     → DEVE mostrare riepilogo €650 + IVA = €793

6. Se il test Step 1 mostra ancora un preventivo con prezzi inventati → il fix non ha funzionato, cerca DOVE vengono generati i prezzi e RIMUOVI

7. Deploy functions + hosting
8. Ritesta
9. Manda email report

Committa con "fix(preventivo): chiedi voci ad Alberto, non inventare prezzi"
