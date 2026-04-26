BUG: quando Alberto chiede di modificare un preventivo, NEXUS ne crea uno nuovo invece di modificare quello esistente.

Se Alberto dice "prepara preventivo per De Amicis intestato a 3i" e c'è GIÀ un preventivo pending per quella sessione (stato attesa_voci o attesa_approvazione), NEXUS deve:
- Riusare il preventivo pending esistente
- NON creare un nuovo documento in nexo_preventivi_pending
- Mostrare: "Hai già un preventivo in corso per De Amicis. Vuoi continuare da dove eravamo o ricominciare da zero?"

Se Alberto dice "modifica" dopo il riepilogo:
- Torna allo stato attesa_voci
- Mostra le voci attuali: "Voci attuali: 1. sopralluogo 200€. Dimmi cosa vuoi cambiare."
- Alberto può dire "togli il sopralluogo", "aggiungi verifica 300", "cambia il sopralluogo a 250"
- Haiku fallback gestisce queste frasi

Se Alberto dice "rifai" o "ricomincia":
- Cancella il pending esistente
- Riparte da zero

Fix in handlers/preventivo.js:
1. In runPreventivoWorkflow: PRIMA di creare un nuovo pending, controlla se ne esiste già uno per la sessione
2. Se esiste: chiedi se continuare o ricominciare
3. In tryInterceptPreventivoApproval o nel routing: "modifica" → torna ad attesa_voci con le voci attuali

Deploy + test + email report.
Committa con "fix(preventivo): modifica riusa pending esistente, non duplica"
