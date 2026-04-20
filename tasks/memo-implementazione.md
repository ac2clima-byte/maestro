Implementa MEMO — Collega Memoria. Primo Collega da attivare dopo IRIS.

CONTESTO:
MEMO è il "chi è costui" di NEXO. Aggrega dati da COSMINA (Firestore progetto acg-clima-service) e li restituisce come dossier unificato. Per v0.1 lavora in sola lettura su Firestore di COSMINA.

PREREQUISITI:
- Lo scaffolding è in projects/memo/ (tipi, azioni stub)
- COSMINA Firestore project: acg-clima-service (database garbymobile-f89ac)
- Guazzotti TEC project: guazzotti-energia
- Leggi ~/acg_suite/CLAUDE.md per la struttura delle collection COSMINA

COSA IMPLEMENTARE:

1. Connessione cross-progetto Firebase:
   - Inizializza due app Firebase: nexo-hub-15f2d (NEXO) + acg-clima-service (COSMINA)
   - Per accedere a COSMINA da NEXO, usa firebase-admin con le credenziali di default (firebase login gestisce entrambi i progetti)

2. Implementa dossierCliente(clienteId) in projects/memo/src/actions/index.ts:
   - Leggi da COSMINA collection crm_clienti (o cosmina_clienti) il documento del cliente
   - Leggi da cosmina_impianti gli impianti associati al cliente
   - Leggi da cosmina_interventi_pianificati gli ultimi 10 interventi
   - Aggrega tutto in un DossierCliente con: nome, contatti, impianti, interventi recenti, ultimo contatto
   - Cache il risultato in nexo-hub Firestore collection memo_dossier (TTL 1 ora)

3. Implementa storicoImpianto(impiantoId):
   - Leggi da cosmina_impianti il documento dell'impianto
   - Leggi interventi collegati
   - Ritorna StoricoImpianto con tutti i dettagli

4. Implementa matchAnagrafica(nome):
   - Cerca in crm_clienti per nome (fuzzy matching con toLowerCase + includes)
   - Cerca in cosmina_impianti per indirizzo
   - Ritorna risultati ordinati per rilevanza

5. Implementa cercaPerContesto(query):
   - Ricerca semplice: cerca il testo nella cache dei dossier
   - Per v0.1 basta una ricerca testuale sulle email IRIS (collection iris_emails) + i dossier cached

6. Crea il listener sulla Lavagna in projects/memo/src/listeners/index.ts:
   - Ascolta nexo_lavagna where to == "memo" and status == "pending"
   - Quando arriva un messaggio tipo "richiesta_dossier": esegui dossierCliente, rispondi sulla Lavagna con status "completed" e payload col dossier

7. Integra con NEXUS — aggiorna la Cloud Function nexusRouter (projects/iris/functions/index.js):
   - Aggiungi handler diretto per query tipo "dimmi tutto su [cliente]", "chi è [nome]", "storico impianto [x]"
   - L'handler chiama direttamente Firestore di COSMINA (come fa per IRIS con iris_emails)
   - NON passare dalla Lavagna per le query — rispondi direttamente

8. Crea uno script di test: projects/memo/scripts/test-dossier.py
   - Connettiti a COSMINA Firestore
   - Leggi un cliente reale
   - Stampa il dossier a console
   - Apri il risultato nel browser

9. Aggiorna la PWA: nella sidebar, cambia il pallino di MEMO da grigio a verde (attivo)

10. Testa con Playwright:
    - Apri https://nexo-hub-15f2d.web.app
    - Apri NEXUS chat
    - Scrivi "dimmi tutto su Kristal" (o un condominio che esiste in COSMINA)
    - Verifica che NEXUS risponda con dati reali
    - Screenshot del risultato
    - Analizza lo screenshot e scrivi il risultato testuale

11. Rideploya tutto (functions + hosting)
12. Committa con "feat(memo): implementazione v0.1 - dossier cliente da COSMINA"
