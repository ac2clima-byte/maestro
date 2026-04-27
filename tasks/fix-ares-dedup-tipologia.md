Implementa i 4 fix da analisi dev-analysis-GPNCxOz2Gha2EkjEljMr (dedup + tipologia interventi).

Come da analisi di Claude Code:

1. DEDUP: raggruppare card con stesso (originalBoardId, dueDay, techName). Mantenere la card con workHours/workDescription più ricchi. Segnalare "1 card duplicata raggruppata".

2. TIPOLOGIA: distinguere INTERVENTI da ACCENSIONE/SPEGNIMENTO da LETTURE nel render. Mostrare "2 interventi e 1 spegnimento" invece di "4 interventi".

3. RENDER: usare il campo name quando è ricco (es. "Senza ACS - Intervento concluso DA MARCO") invece di mostrare solo boardName.

4. Centralizzare in shared.js la funzione cardDuplicateGroupKey().

5. ANCHE: implementa il fix labels[] (task precedente fix-ares-labels-tecnico): un tecnico è assegnato se è in techName OR techNames[] OR labels[].name.

Testa con nexusTestInternal:
- "interventi di Marco ieri" → deve mostrare 3 attività (2 interventi + 1 spegnimento), non 4
- "interventi di Marco oggi" → deve trovare card se Marco è in labels[]

Deploy + test + email report.
Committa con "fix(ares): dedup card + tipologia + labels + render migliorato"
