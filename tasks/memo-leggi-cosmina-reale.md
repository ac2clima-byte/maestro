MEMO dice "ho accesso solo a iris_emails" quando gli chiedi un dossier. Ma i permessi cross-progetto su garbymobile-f89ac ESISTONO GIÀ (ARES li usa per leggere gli interventi).

FIX: l'handler MEMO nel nexusRouter deve leggere da COSMINA Firestore (garbymobile-f89ac).

1. Verifica che i permessi funzionino — ARES già legge da garbymobile-f89ac. Usa lo stesso pattern di connessione.

2. Aggiorna l'handler MEMO (handleMemoDossier o simile) nel nexusRouter per:
   - Connettersi a Firestore garbymobile-f89ac (come fa handleAresInterventiAperti)
   - Cercare il condominio/cliente in queste collection:
     * crm_clienti (o cosmina_clienti)
     * cosmina_impianti (cerca per nome condominio nell'indirizzo o nel campo condominio)
     * cosmina_interventi_pianificati (interventi collegati)
   - Se il nome è "La Bussola" o "condominio la bussola", cerca fuzzy (toLowerCase + includes)
   
3. Il dossier deve includere:
   - Nome cliente/condominio
   - Indirizzo
   - Impianti installati (da cosmina_impianti)
   - Ultimi 10 interventi (da cosmina_interventi_pianificati o dalla collection interventi)
   - Email recenti (da iris_emails — questo già funziona)
   - Se ha RTI/RTIDF su guazzotti-tec (se applicabile)

4. Testa con Playwright:
   - "dimmi tutto su La Bussola"
   - "dimmi tutto su Kristal"  
   - "dimmi tutto su Malvicino" (questo è una persona, non un condominio)
   - Screenshot + analisi testuale

5. Rideploya functions
6. Committa con "feat(memo): dossier reale da COSMINA + Guazzotti TEC"
