NEXUS non trova "Alberto" nei contatti interni. Cerca solo in crm_clienti (clienti esterni).

FIX:

1. Quando ECHO/MEMO cerca un contatto, deve cercare in QUEST'ORDINE:
   a. cosmina_config/tecnici_acg (tecnici: Malvicino, Dellafiore, Victor, Marco, David)
   b. Contatti interni/dipendenti (Alberto Contardi = proprietario, Sara = admin)
   c. crm_clienti (clienti esterni)

2. Per i contatti interni, leggi la collection cosmina_config su garbymobile-f89ac:
   - Cerca documento "tecnici_acg" o simile
   - Leggi i campi: nome, cognome, telefono, email
   - Se non c'è una collection dedicata, crea un documento cosmina_config/nexo_contatti_interni con:
     {
       "alberto_contardi": { "nome": "Alberto Contardi", "ruolo": "titolare", "telefono": "LEGGILO_DA_HERMES_ENV" },
       "sara": { "nome": "Sara", "ruolo": "amministrazione" },
       "cristina_davi": { "nome": "Cristina Davì", "ruolo": "admin Guazzotti" }
     }
   - Leggi il telefono di Alberto da /mnt/c/HERMES/.env o dai file di configurazione COSMINA

3. Alias impliciti:
   - "Alberto" senza cognome = Alberto Contardi (è il titolare, è chi usa il sistema)
   - "Malvicino" = Andrea Malvicino
   - "Dellafiore" = Lorenzo Dellafiore
   - "Sara" = Sara (amministrazione)

4. Testa:
   - "manda whatsapp a Alberto: test" → deve trovare Alberto Contardi e il suo numero
   - "manda whatsapp a Malvicino: domani Kristal ore 14" → deve trovare Andrea Malvicino

5. Rideploya functions
6. Committa con "feat(echo): ricerca contatti interni + alias dipendenti"
