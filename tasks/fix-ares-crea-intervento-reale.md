Due bug nella creazione interventi:

## Bug 1: Data sbagliata — "domani" calcola la data errata
Alberto dice "domani mattina" il 27/04 (lunedì) → NEXUS dice lunedì 27/04 invece di martedì 28/04.
Il parser "domani" deve usare Europe/Rome e aggiungere +1 giorno alla data CORRETTA di oggi.

Fix in handlers/ares.js:
- Usa la funzione oraRoma() da shared.js (creata col fix timezone)
- "domani" = oraRoma() + 1 giorno
- Verifica: se oggi è lunedì 27/04, domani = martedì 28/04

## Bug 2: Non deve dire "DRY_RUN" — deve chiedere conferma e poi creare realmente
Il flusso corretto:
1. NEXUS mostra riepilogo: "Creo intervento per Victor, martedì 28/04 alle 09:00, Residenza Le Rose: controllo impianto solare. Confermi?"
2. Alberto dice "sì" o "conferma" → NEXUS crea REALMENTE la card in bacheca_cards su garbymobile-f89ac
3. NEXUS conferma: "Intervento creato per Victor martedì 28 aprile alle Residenza Le Rose."
4. NON dire "dry run", "modalità test", "simulato" — è confuso per l'utente

Fix:
- Rimuovi i messaggi "DRY_RUN" e "modalità test" dal render
- Il primo messaggio è il riepilogo con "Confermi?"
- Dopo la conferma: scrivi realmente in bacheca_cards con:
  - listName: "INTERVENTI DA ESEGUIRE"
  - techName: "VICTOR"
  - techNames: ["VICTOR"]
  - name: "controllo impianto solare"
  - boardName: "RESIDENZA LE ROSE" (cerca in COSMINA il nome completo + indirizzo)
  - due: "2026-04-28T09:00:00+02:00"
  - status: "aperto"
  - createdBy: "NEXUS"
  - labels: [{"name":"VICTOR","color":"sky"},{"name":"MATTINO","color":"yellow"}]

## Test con nexusTestInternal (NON creare card reali nei test FORGE)
- Il test verifica solo che il riepilogo sia corretto e la data sia martedì 28
- NON confermare nel test (niente "sì" dopo il riepilogo)

Deploy + test + email report.
Committa con "fix(ares): crea intervento reale + data domani corretta"
