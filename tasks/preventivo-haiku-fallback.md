Quando NEXUS è nel flusso preventivo e non capisce un messaggio, deve chiedere a Haiku di interpretarlo invece di dire "non ho capito".

## Fix

In handlers/preventivo.js, nei vari intercept (tryInterceptPreventivoVoci, tryInterceptPreventivoIva, tryInterceptPreventivoApproval):

1. Se NESSUN intercept matcha il messaggio E c'è un preventivo pending per la sessione:
   - NON dire "non ho capito"
   - Chiama Haiku con questo prompt:

```
Sei l'assistente NEXUS di ACG Clima Service. Alberto sta preparando un preventivo.

Stato attuale del preventivo:
- Intestatario: [dati]
- Condominio: [dati]  
- Voci inserite: [lista voci con importi]
- IVA attuale: [aliquota]%
- Totale attuale: [totale]€
- Stato: [attesa_voci / attesa_approvazione]

Alberto ha scritto: "[messaggio di Alberto]"

Interpreta cosa vuole fare. Rispondi SOLO con un JSON:
{
  "azione": "modifica_iva" | "aggiungi_voce" | "rimuovi_voce" | "modifica_voce" | "sconto" | "approva" | "annulla" | "chiarimento",
  "parametri": {
    // per modifica_iva: { aliquota: 0, regime: "reverse_charge", nota: "..." }
    // per aggiungi_voce: { descrizione: "...", importo: 50 }
    // per rimuovi_voce: { descrizione: "relazione tecnica" }
    // per sconto: { percentuale: 10 }
    // per chiarimento: { domanda: "Vuoi dire...?" }
  }
}
```

2. In base all'azione di Haiku, esegui l'operazione:
   - modifica_iva → aggiorna aliquota e ricalcola
   - aggiungi_voce → aggiungi alla lista voci e ricalcola
   - rimuovi_voce → rimuovi dalla lista e ricalcola
   - sconto → applica sconto su tutte le voci
   - approva → procedi con approvazione
   - annulla → annulla preventivo
   - chiarimento → chiedi chiarimento ad Alberto

3. Questo è il FALLBACK — i parser regex hanno priorità. Haiku interviene SOLO quando i regex non matchano.

## Test

Con nexusTestInternal, flusso completo:
1. "prepara preventivo per De Amicis intestato a 3i"
2. "verifica impianto 200€"
3. "iva 0 reverse charge, è un'azienda" → Haiku capisce: modifica_iva, reverse_charge
4. "aggiungi anche il viaggio 50 euro" → Haiku capisce: aggiungi_voce
5. "togli il viaggio" → Haiku capisce: rimuovi_voce

Deploy + test + email report.
Committa con "feat(preventivo): Haiku fallback intelligente per comandi non parsati"
