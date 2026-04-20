PREREQUISITO: esegui dopo echo-implementazione.

Implementa ARES — Collega Operativo. Terzo Collega da attivare.

CONTESTO:
ARES gestisce il ciclo di vita degli interventi tecnici in COSMINA. Per v0.1 implementiamo apertura e assegnazione intervento.

PREREQUISITI:
- Scaffolding in projects/ares/
- COSMINA Firestore project: acg-clima-service
- Leggi ~/acg_suite/CLAUDE.md per le collection COSMINA: cosmina_impianti, cosmina_interventi_pianificati, cosmina_config/tecnici_acg
- Tecnici: Andrea Malvicino, Lorenzo Dellafiore, Victor David Dellafiore

COSA IMPLEMENTARE:

1. Connessione a COSMINA Firestore (come MEMO)

2. Implementa apriIntervento(params) in projects/ares/src/actions/index.ts:
   - Crea documento in cosmina_interventi_pianificati (o la collection corretta per interventi)
   - Campi: tipo, urgenza, descrizione, indirizzo, cliente, stato="aperto"
   - Ritorna l'intervento creato con id

3. Implementa assegnaTecnico(interventoId, tecnicoUid):
   - Aggiorna l'intervento con tecnico assegnato
   - Cambia stato a "assegnato"
   - Scrivi sulla Lavagna per ECHO: "notifica tecnico dell'assegnazione"

4. Implementa interventiAperti(filtri):
   - Query cosmina_interventi_pianificati dove stato != "completato"
   - Filtri: per tecnico, zona, urgenza

5. Implementa il listener sulla Lavagna:
   - Ascolta nexo_lavagna where to == "ares" and status == "pending"
   - Tipo "richiesta_intervento" da IRIS: apri intervento automaticamente
   - Tipo "guasto_urgente" da IRIS: apri intervento con urgenza critica

6. Integra con NEXUS — aggiorna Cloud Function nexusRouter:
   - Handler per "apri intervento...", "assegna...", "interventi aperti", "cosa c'è da fare oggi?"
   - Quando l'utente chiede di aprire un intervento: ARES lo crea in COSMINA
   - Rispondi con i dettagli dell'intervento creato

7. Testa con Playwright:
   - NEXUS chat: "apri intervento caldaia guasta al Condominio Kristal, urgente"
   - Verifica che l'intervento appaia in COSMINA
   - NEXUS chat: "interventi aperti oggi"
   - Screenshot + analisi testuale

8. Aggiorna PWA: pallino ARES da grigio a verde + sezione ARES nella dashboard con lista interventi aperti

9. Rideploya tutto
10. Committa con "feat(ares): implementazione v0.1 - apertura e assegnazione interventi COSMINA"
