Aggiungi un bottone "NEXO" nella landing page di ACG Suite.

1. Leggi il file della landing page di ACG Suite: cerca in ~/acg_suite/ il file index.html o la pagina di acgsuite.web.app

2. Aggiungi un bottone/card "NEXO — Colleghi AI" che linka a https://nexo-hub-15f2d.web.app
   - Posizione: visibile ma non invasivo (tra le altre app della Suite)
   - Stile: coerente con il design della landing esistente
   - Icona: 🧠 o simile
   - Sottotitolo: "Piattaforma AI per ACG Clima Service"

3. Il bottone è visibile a tutti ma NEXO ha il suo login — solo Alberto può accedere

4. Deploya la landing aggiornata: cd ~/acg_suite && firebase deploy --only hosting:acgsuite (o il comando corretto per la landing)

5. Apri nel browser: cmd.exe /c start https://acgsuite.web.app

6. Committa con "feat(suite): link NEXO nella landing page"
