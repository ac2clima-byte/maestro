Le pagine dei Colleghi nella PWA mostrano ancora "Collega in costruzione". Tutti i Colleghi sono ora operativi via NEXUS Chat (13/13 test passati). Aggiorna la PWA per riflettere lo stato reale.

Per ogni Collega nella sidebar:

1. IRIS: già funzionante, pallino verde ✅
2. ARES: cambia a "Operativo v0.1" con pallino verde. Mostra lista interventi aperti (query reale a COSMINA come fa nexusRouter)
3. CHRONOS: pallino verde. Mostra prossime scadenze manutenzione
4. MEMO: pallino verde. Mostra campo ricerca cliente con risultato dossier
5. CHARTA: pallino verde. Mostra fatture recenti da email IRIS
6. ECHO: pallino verde. Mostra storico messaggi inviati da echo_messages
7. EMPORION: pallino verde. Mostra stato magazzino (articoli sotto scorta)
8. DIKEA: pallino verde. Mostra scadenze CURIT/normative
9. DELPHI: pallino verde. Mostra KPI dashboard
10. PHARO: pallino verde. Mostra stato suite + alert attivi
11. CALLIOPE: pallino giallo (genera bozze via NEXUS chat, non ha pagina propria)

Per ogni pagina Collega:
- Rimuovi il blocco "Collega in costruzione"
- Aggiungi una sezione con i dati reali letti da Firestore (stesse query che usa nexusRouter)
- In fondo: bottone "Apri in NEXUS Chat" che apre il pannello chat con un prompt precompilato

Rideploya hosting.
Testa con Playwright: naviga a ogni pagina Collega, screenshot, analisi testuale.
Committa con "feat(pwa): tutti i Colleghi attivi con dati reali"
