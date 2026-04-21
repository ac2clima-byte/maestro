ECHO non trova "Malvicino" perché cerca solo in crm_clienti. I tecnici sono contatti INTERNI, non clienti.

FIX nell'handler ECHO del nexusRouter:

1. Ordine di ricerca per risolvere un nome a numero di telefono:
   a. PRIMA: cosmina_config/tecnici_acg (tecnici interni: Malvicino, Dellafiore, Victor, Marco, David)
   b. POI: cosmina_config/personale o collection equivalente per personale ufficio (Sara, Cristina Davì, Alberto)
   c. INFINE: crm_clienti (clienti esterni, amministratori)

2. Leggi da Firestore (progetto garbymobile-f89ac) la collection cosmina_config/tecnici_acg e stampa a console la struttura di un documento per capire dove sono nome e telefono

3. Implementa la ricerca fuzzy: "Malvicino" deve matchare "Andrea Malvicino" o "MALVICINO" — case insensitive, match parziale su nome o cognome

4. Se il tecnico non ha telefono nel documento Firestore, segnalalo: "Malvicino trovato nei tecnici ma senza numero di telefono"

5. Testa con Playwright:
   - "manda whatsapp a Malvicino: test"
   - "manda whatsapp a Sara: buongiorno"
   - "manda whatsapp a Alberto: test nexo"

6. Rideploya functions
7. Committa con "fix(echo): cerca contatti interni (tecnici) prima dei clienti"
