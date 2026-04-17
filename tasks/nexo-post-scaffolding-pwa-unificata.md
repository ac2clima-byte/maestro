PREREQUISITO: questo task va eseguito DOPO il task nexo-scaffolding-completo.

Crea la struttura base della PWA unificata NEXO.

1. Crea projects/nexo-pwa/ con una single page app che:
   - Ha una sidebar/navbar con i nomi dei Colleghi: IRIS, ARES, CHRONOS, MEMO, CHARTA, EMPORION, DIKEA, DELPHI, PHARO, CALLIOPE
   - Cliccando su IRIS: mostra la dashboard IRIS esistente (copia/integra da projects/iris/pwa/index.html)
   - Cliccando sugli altri: mostra una card "Collega in costruzione" con il README del Collega
   - Home page: dashboard NEXO con:
     - Stato Lavagna (ultimi 10 messaggi)
     - Alert attivi (da PHARO)
     - Digest email (da IRIS)
     - Interventi aperti (placeholder)
   - Design: sfondo bianco, sidebar scura, stile professionale, mobile-first
   - Login Firebase Auth (bypassato per dev)

2. Deploya su Firebase Hosting (sostituisce la PWA IRIS attuale)

3. Apri nel browser

4. Committa con "feat(nexo): PWA unificata con sidebar Colleghi"
