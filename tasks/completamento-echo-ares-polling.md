PREREQUISITO: dopo refactor-modularizza.

Completa ciò che Sprint 2 non ha finito (timeout).

1. ECHO — Rubrica dalla collection corretta:
   Leggi context/memo-firestore-garbymobile.md per trovare la collection rubrica interni.
   Aggiorna handlers/echo.js per leggere i numeri dalla collection corretta.
   Testa: "manda WA a Malvicino" deve trovare il numero.

2. ARES — Listener Lavagna:
   Aggiungi Cloud Function onDocumentCreated su nexo_lavagna where to=="ares":
   - richiesta_intervento → apriIntervento (dry-run)
   - guasto_urgente → apriIntervento urgente + notifica ECHO
   NON mettere tutto in index.js — crea un file separato functions/triggers/ares-lavagna.js

3. Polling IRIS:
   Verifica se irisPoller funziona: firebase functions:log --only irisPoller | tail -10
   Se non funziona, stampa l'errore e proponi una soluzione.

4. Regole IRIS:
   Verifica che iris_rules contenga le 4 regole predefinite.
   Se vuote: esegui python3 projects/iris/scripts/seed_rules.py

5. PHARO fix falsi positivi:
   In handlers/pharo.js, filtra: fatturabile=true, escludi rtidf_fatturato/fatturato.
   Per CRTIDF: non segnalare costo=0.

Committa modulare: un commit per ogni punto.
