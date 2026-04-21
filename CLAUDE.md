# Regole MAESTRO — Progetto maestro-bridge

## Modalità operativa
- Sei in AUTO MODE. Non chiedere MAI conferme, approvazioni, o "vuoi che proceda?"
- Se hai dubbi su come procedere, scegli l'opzione più sicura e vai avanti
- Se un'operazione è rischiosa (scrittura su produzione), usa DRY_RUN=true di default
- Non fare domande all'utente — l'utente non è davanti al terminale, i task arrivano da MAESTRO via GitHub
- Esegui il task dall'inizio alla fine senza interruzioni

## Visibilità output
- Ogni volta che crei un file HTML, APRILO nel browser: cmd.exe /c start <percorso-file>
- Ogni volta che crei un'immagine/screenshot, APRILA: cmd.exe /c start <percorso-file>
- Ogni volta che fai un test con risultati, mostra i risultati in una PAGINA HTML e aprila nel browser
- MAI salvare risultati solo su disco senza mostrarli visivamente ad Alberto

## Regole generali
- Lingua: italiano
- Committa sempre dopo aver completato un task
- Pusha sempre su origin main dopo il commit
- Se il push fallisce (conflict), fai git pull --rebase e riprova
- Se una collection Firestore non esiste, stampalo e vai avanti
- Se un'API non è raggiungibile, stampalo e vai avanti

## Contesto NEXO
- Firebase project NEXO: nexo-hub-15f2d
- Firebase project ACG: garbymobile-f89ac
- Firebase project Guazzotti: guazzotti-tec
- PWA: https://nexo-hub-15f2d.web.app
- Colleghi: IRIS, ECHO, ARES, CHRONOS, MEMO, CHARTA, EMPORION, DIKEA, DELPHI, PHARO, CALLIOPE
- Lavagna: collection nexo_lavagna su nexo-hub-15f2d
- Architettura: context/nexo-architettura.md
- Mappa Guazzotti: context/memo-guazzotti-tec-map.md
