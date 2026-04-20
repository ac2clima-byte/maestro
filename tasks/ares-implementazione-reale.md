PREREQUISITO: dopo echo-implementazione-reale.

ARES ha ancora stub "Not implemented". Implementa la logica REALE.

1. Connettiti a COSMINA Firestore (progetto acg-clima-service) come fa MEMO
   Leggi ~/acg_suite/CLAUDE.md per capire le collection degli interventi.

2. Implementa apriIntervento in projects/ares/src/actions/index.ts:
   - Crea un documento nella collection corretta di COSMINA per gli interventi
   - Campi minimi: tipo, urgenza, descrizione, indirizzo, stato="aperto", createdAt
   - Ritorna l'id dell'intervento creato

3. Implementa interventiAperti:
   - Query COSMINA per interventi con stato != "completato"
   - Ritorna lista

4. Implementa il listener Lavagna che ascolta messaggi per "ares":
   - "richiesta_intervento" da IRIS → apriIntervento automaticamente
   - "guasto_urgente" da IRIS → apriIntervento con urgenza critica + notifica ECHO

5. Aggiorna la Cloud Function nexusRouter:
   - "apri intervento..." → crea in COSMINA e rispondi con dettagli
   - "interventi aperti" → lista interventi e rispondi
   - "cosa c'è da fare oggi?" → interventi del giorno

6. Aggiorna PWA dashboard sezione ARES con lista interventi aperti reali

7. Testa con Playwright:
   - "apri intervento caldaia guasta Condominio Kristal urgente"
   - "interventi aperti"
   - Screenshot + analisi testuale

8. Rideploya tutto
9. Committa con "feat(ares): implementazione reale - interventi COSMINA"
