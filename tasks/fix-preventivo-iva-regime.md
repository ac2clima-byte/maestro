Il preventivo non gestisce regimi IVA diversi. Alberto ha scritto "iva 0 reverse charge, è un'azienda" e NEXUS non ha capito.

## Fix

In handlers/preventivo.js, nel flusso attesa_approvazione (dopo che le voci sono state parsate):

1. Quando Alberto risponde con indicazioni sull'IVA, NEXUS deve capire e ricalcolare:
   - "iva 0" / "senza iva" / "esente iva" → IVA 0%
   - "reverse charge" / "inversione contabile" → IVA 0% + nota "Operazione in reverse charge art. 17 c.6 DPR 633/72"
   - "iva 10" / "iva 10%" → IVA 10%
   - "iva 4" / "iva 4%" → IVA 4%
   - "iva 22" / "iva 22%" → IVA 22% (default)
   - "split payment" → IVA 22% esposta ma non incassata + nota "Split payment art. 17-ter DPR 633/72"

2. Aggiungi un intercept PRIMA del check approvazione:
   - Se il messaggio contiene "iva" o "reverse" o "split" o "esente":
     → Aggiorna il preventivo pending con la nuova aliquota e nota fiscale
     → Ricalcola: imponibile resta uguale, IVA cambia, totale cambia
     → Mostra il nuovo riepilogo

3. Per "iva 0 reverse charge, è un'azienda":
   → Aliquota: 0%
   → Nota: "Operazione soggetta a reverse charge ex art. 17 c.6 DPR 633/72"
   → Riepilogo: "Imponibile 200,00€, IVA 0% (reverse charge), totale 200,00€"
   → "Lo genero in PDF?"

4. Testa con nexusTestInternal:
   - "prepara preventivo per De Amicis intestato a 3i"
   - "verifica impianto termico 200€"
   - "iva 0 reverse charge" → deve ricalcolare con IVA 0%
   - "sì" → deve procedere con PDF

5. Deploy + test + email report
6. Committa con "feat(preventivo): gestione regimi IVA (reverse charge, split, esente)"
