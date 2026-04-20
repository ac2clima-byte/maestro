Implementa i Colleghi rimanenti con lo stesso pattern di MEMO/ECHO/ARES:
- Lettura REALE da Firestore (COSMINA o nexo-hub)
- Scrittura con DRY_RUN=true di default
- Integrazione con NEXUS router (handler nella Cloud Function)
- Pallino verde nella PWA

Procedi uno alla volta nell'ordine sotto. Per ogni Collega: implementa le 2-3 azioni di lettura più importanti, lascia il resto come stub v0.2.

## CHRONOS
- Lettura: slotDisponibili() → leggi da cosmina_interventi_pianificati (bacheca_cards) gli interventi pianificati per data/tecnico
- Lettura: scadenzeProssime() → leggi da cosmina_impianti le scadenze manutenzione
- NEXUS handler: "quando è libero [tecnico]?", "scadenze prossime"

## CHARTA  
- Lettura: estraiIncassiDaEmail(body) → parsing testo email con regex per trovare importi e riferimenti
- Lettura: reportMensile() → aggregazione dai dati disponibili
- NEXUS handler: "incassi di oggi", "fatture scadute" (placeholder se non ci sono dati)

## EMPORION
- Lettura: disponibilita(codice) → leggi da cosmina collection magazzino (cerca la collection corretta come hai fatto per ARES)
- NEXUS handler: "c'è il pezzo [x]?", "giacenze"

## DIKEA
- Lettura: scadenzeCURIT() → leggi da cosmina_impianti_cit o simile
- NEXUS handler: "scadenze CURIT", "impianti senza targa"

## DELPHI
- Lettura: kpiDashboard() → aggregazione dati da iris_emails + bacheca_cards
- Lettura: costoAI() → leggi da cosmina_config/ai_usage se esiste
- NEXUS handler: "come siamo andati questo mese?", "costo AI"

## PHARO
- Lettura: statoSuite() → health check base (verifica che Firestore risponda, conta alert)
- Lettura: emailSenzaRisposta() → query iris_emails per follow-up
- NEXUS handler: "stato della suite", "problemi aperti"

## CALLIOPE
- Implementa bozzaRisposta(emailId, tono) con Claude Sonnet via API
- NEXUS handler: "scrivi una risposta a [email]", "prepara un sollecito"
- DRY_RUN: la bozza viene generata ma non inviata (Alberto la approva)

Per ogni Collega:
1. Scopri le collection reali (come hai fatto con bacheca_cards per ARES)
2. Implementa le letture
3. Aggiungi handler in nexusRouter  
4. Aggiorna pallino PWA
5. Testa con Playwright + analizza screenshot
6. Committa singolarmente

Alla fine: rideploya tutto (functions + hosting)
