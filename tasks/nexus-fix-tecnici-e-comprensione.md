NEXUS non riesce a rispondere "quali sono i tecnici di acg clima?" e non capisce frasi contestuali come "dovresti vederli su firestore".

## Fix 1 — Handler tecnici

In handlers/memo.js o handlers/nexus.js, aggiungi handler per domande sui tecnici:

Pattern da riconoscere: "tecnici", "lista tecnici", "chi sono i tecnici", "tecnici acg", "tecnici guazzotti"

Azione:
- Leggi dalla rubrica COSMINA (la collection contatti interni su garbymobile-f89ac)
- Filtra per categoria "tecnico"
- Rispondi in linguaggio naturale: "I tecnici ACG sono: David Aime, Gianluca Albanesi, Lorenzo Dellafiore, Victor Dellafiore, Marco Piparo, Federico Tosca e Antonio Troise."
- Se chiede anche Guazzotti: "Quelli di Guazzotti sono: [lista]"

Aggiungi anche ai DIRECT_HANDLERS in nexus.js il pattern per tecnici.

## Fix 2 — Comprensione contestuale migliorata

Quando NEXUS non capisce una frase, NON deve dire "Non ho capito, puoi riformulare?". Deve:
- Guardare il contesto (messaggi precedenti della sessione)
- Se l'utente dice "dovresti vederli su firestore" dopo aver chiesto dei tecnici → capire che vuole la lista tecnici dal database
- Usa il contesto conversazionale (gli ultimi 5 messaggi) nel prompt Haiku

Il system prompt deve includere:
"Se l'utente dice qualcosa che non capisci al primo colpo, guarda i messaggi precedenti per capire il contesto. Non rispondere mai 'non ho capito' se puoi dedurre l'intenzione dal contesto."

Deploy functions.
Committa con "fix(nexus): handler tecnici + comprensione contestuale"
