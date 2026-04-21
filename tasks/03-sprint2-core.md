# Sprint 2 — Colleghi core funzionanti

## Task 2.1: ECHO — Rubrica reale dalla collection giusta
PREREQUISITO: task 1.3 (MEMO ha mappato COSMINA e trovato la collection rubrica)

1. Usa la mappa di MEMO (context/memo-firestore-garbymobile.md) per trovare la collection della rubrica contatti interni
2. Aggiorna l'handler ECHO nel nexusRouter per leggere dalla collection CORRETTA
3. Per ogni contatto: nome, cognome, interno, tel personale, tel lavoro, email, categoria (tecnico/ufficio), azienda (ACG/Guazzotti)
4. Cerca fuzzy per cognome, nome, o nome completo
5. Se più match: disambigua ("Ho trovato 3 Malvicino: Andrea, Lorenzo, Maurizio. Quale?")
6. Se nessun telefono: "Trovato [nome] ma senza cellulare. Ha interno [XXX]"
7. Testa: "manda WA a Malvicino", "manda WA a Sara", "manda WA a Dellafiore Lorenzo"
8. Screenshot + analisi
9. Committa con "fix(echo): rubrica dalla collection corretta di COSMINA"

## Task 2.2: ARES — Apertura intervento reale con dry-run
PREREQUISITO: task 1.3 (MEMO ha mappato la struttura interventi COSMINA)

1. Usa la mappa di MEMO per la struttura esatta della collection interventi
2. Implementa apriIntervento che SCRIVE realmente su COSMINA:
   - Campo ARES_DRY_RUN in Firestore cosmina_config/ares_config (default: true)
   - Se dry-run: logga cosa avrebbe scritto, rispondi "Simulato"
   - Se non dry-run: scrivi il documento nella collection interventi
3. Implementa il listener Lavagna per ARES:
   - Ascolta nexo_lavagna where to=="ares" and status=="pending"
   - Tipo "richiesta_intervento": chiama apriIntervento
   - Tipo "guasto_urgente": chiama apriIntervento con urgenza critica + notifica ECHO
   - Segna il messaggio come "completed" dopo l'esecuzione
4. Aggiorna dashboard ARES nella PWA: mostra lista interventi aperti reali (non solo "Parla via NEXUS")
5. Testa con Playwright
6. Committa con "feat(ares): apertura intervento reale + listener Lavagna"

## Task 2.3: Polling IRIS 24/7 — Verificare e attivare
1. Verifica se le Cloud Functions irisPoller/irisPollScheduled funzionano:
   - firebase functions:log --only irisPoller --project nexo-hub-15f2d | tail -20
   - firebase functions:log --only irisPollScheduled --project nexo-hub-15f2d | tail -20
2. Se non funzionano (errore exchangelib/credenziali):
   - Opzione A: usa node-ews (pacchetto npm) invece di exchangelib (Python) dentro la Cloud Function
   - Opzione B: crea la Cloud Function in Python (2nd Gen supporta Python)
   - Opzione C: usa un approccio diverso — Cloud Function che chiama un endpoint su Hetzner dove gira il poller Python
3. Le credenziali EWS devono essere in Secret Manager:
   - firebase functions:secrets:set EWS_USERNAME
   - firebase functions:secrets:set EWS_PASSWORD
   - firebase functions:secrets:set EWS_URL
4. Verifica che il poller funzioni: invoca manualmente irisPollerRun (HTTP endpoint)
5. Controlla che le nuove email appaiano in iris_emails
6. Committa con "feat(iris): polling 24/7 verificato e attivo"

## Task 2.4: Regole IRIS — Test end-to-end
1. Verifica che le 4 regole predefinite esistano in iris_rules:
   - Se non esistono: esegui python3 projects/iris/scripts/seed_rules.py
2. Verifica che irisRuleEngine (trigger onDocumentCreated su iris_emails) funzioni:
   - Crea un documento di test in iris_emails con categoria GUASTO_URGENTE
   - Controlla se la regola scatta e scrive sulla Lavagna
3. Se non funziona, logga l'errore e fixa
4. Testa la regola "Incassi ACG":
   - Crea un documento di test in iris_emails con mittente "malvicino" e oggetto "INCASSI ACG"
   - Verifica che scatti: scrivi Lavagna per CHARTA + scrivi Lavagna per ECHO
5. Committa con "test(iris): regole automatiche testate end-to-end"

## Task 2.5: PHARO — Fix falsi positivi alert RTI
1. Aggiorna handlePharoRtiMonitoring nella Cloud Function:
   - Filtra RTI con fatturabile=true (escludi i non fatturabili)
   - Escludi RTI con stato rtidf_fatturato (già fatturati)
   - Escludi RTIDF con stato fatturato
   - Per CRTIDF: non segnalare costo_intervento=0 come alert (è normale per contabilizzazione)
2. Ricalcola i numeri:
   - Quanti GRTI fatturabili senza GRTIDF? (era 291, ora sarà meno)
   - Valore economico reale bloccato (era €5.670, ora potrebbe essere diverso)
3. Aggiorna la dashboard PHARO nella PWA con numeri corretti
4. Rideploya
5. Committa con "fix(pharo): escludi fatturati e non fatturabili dagli alert"
