PREREQUISITO: esegui dopo scaffolding-batch1.

Leggi context/nexo-architettura.md. Crea lo scaffolding per CHRONOS e MEMO.

Stessa struttura: README, package.json, tsconfig, .env.example, src/types, src/actions, src/listeners, src/index.ts, tests.

CHRONOS (projects/chronos/):
- Collega Pianificatore: agende tecnici, scadenze, campagne
- Tipi: Slot (tecnico, data, ora, tipo), AgendaGiornaliera, Scadenza, Campagna, ConflittoAgenda, Festivita
- Azioni: slotDisponibili, agendaGiornaliera, agendaSettimanale, prenotaSlot, liberaSlot, scadenzeProssime, scadenzeScadute, pianificaCampagna, trovaConflitti, riprogramma, ottimizzaGiornata, registraFerie, registraMalattia
- .env: COSMINA_PROJECT_ID=acg-clima-service, FIREBASE_PROJECT_ID=nexo-hub-15f2d, ORE_LAVORATIVE_GIORNO=8
- Ascolta Lavagna: richiesta_slot, scadenza_normativa, richiesta_riprogrammazione

MEMO (projects/memo/):
- Collega Memoria: dossier cliente, storico impianti, documenti su disco
- Tipi: DossierCliente (contatti, impianti, interventi, fatture, email, esposizione, sentiment, rischioChurn), StoricoImpianto, DocumentoDisco, Relazione
- Azioni: dossierCliente, dossierCondominio, storicoImpianto, cercaDocumenti, ultimiContatti, matchAnagrafica, nuovoCliente, collegaEntita, consumiMedi, rischioChurn, cercaPerContesto
- .env: COSMINA_PROJECT_ID, GUAZZOTTI_PROJECT_ID, DISCO_N_PATH=/mnt/n, DISCO_I_PATH=/mnt/i, FIREBASE_PROJECT_ID=nexo-hub-15f2d
- Ascolta Lavagna: richiesta_dossier, nuovo_cliente_rilevato

DRY_RUN=false in entrambi.
Committa con "feat(nexo): scaffolding CHRONOS + MEMO"
