Il bottone 🐛 nella chat NEXUS non trasmette la conversazione. I bug arrivano con Type: generic e Session: (n/a) invece di Type: bug_from_chat con la conversazione.

Fix nella PWA (js/app.js):
1. Trova il codice del bottone bug NELLA CHAT (non quello globale in alto)
2. Verifica che quando si clicca il 🐛 nella chat:
   - type sia "bug_from_chat" (non "generic")
   - sessionId sia il sessionId corrente della chat NEXUS
   - conversation contenga gli ultimi 10 messaggi della sessione corrente
3. Il bottone globale (in alto a destra della pagina) può restare type: generic
4. Ma il bottone dentro la chat DEVE avere type: bug_from_chat + conversazione

Probabilmente il problema è che il bottone nella chat usa lo stesso handler del bottone globale. Serve un handler separato che legge i messaggi dalla chat corrente.

Deploy hosting.
Email report.
Committa con "fix(nexus): bottone bug in chat trasmette conversazione"
