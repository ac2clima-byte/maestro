CRITICO: il file projects/iris/functions/index.js ha 4231 righe. È troppo grande e non scalabile.

Spezzalo in moduli. Un file per Collega.

1. Crea la struttura modulare in projects/iris/functions/:
   handlers/
   ├── iris.js        — handler email (contaUrgenti, emailOggi, emailPerCategoria, ecc.)
   ├── echo.js        — handler WhatsApp
   ├── ares.js        — handler interventi
   ├── chronos.js     — handler scadenze/agende
   ├── memo.js        — handler dossier
   ├── charta.js      — handler fatture/incassi
   ├── emporion.js    — handler magazzino
   ├── dikea.js       — handler compliance
   ├── delphi.js      — handler KPI/analisi
   ├── pharo.js       — handler monitoring/alert RTI
   ├── calliope.js    — handler bozze
   ├── nexus.js       — router principale Haiku
   └── shared.js      — connessioni Firebase cross-project, utility comuni

2. Ogni file handler esporta le sue funzioni:
   // handlers/echo.js
   export async function handleEchoWhatsApp(db, cosminaDb, guazzottiDb, req, res, intent) { ... }

3. index.js diventa solo il router che importa i moduli:
   import { handleEchoWhatsApp } from './handlers/echo.js';
   import { handleAresInterventiAperti, handleAresApriIntervento } from './handlers/ares.js';
   // ecc.

4. shared.js contiene:
   - Inizializzazione Firebase multi-progetto (nexo, cosmina, guazzotti)
   - applyCors()
   - rate limiting
   - autenticazione (verifica token Firebase Auth)

5. index.js dopo il refactor: max 200 righe (solo import + routing switch)

6. NON cambiare la logica — solo spostare il codice nei file giusti

7. Verifica che tutto funzioni: firebase deploy --only functions
8. Testa con Playwright: 3 domande rapide a NEXUS
9. Committa con "refactor: modularizza nexusRouter - 1 file per Collega"
