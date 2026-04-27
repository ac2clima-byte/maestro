Bug critico ARES: 222 card ignorano tecnici assegnati via labels[]. Fix come da analisi dev-analysis-GPNCxOz2Gha2EkjEljMr.md.

In handlers/ares.js, la funzione che cerca gli interventi per tecnico deve includere labels[]:

Un tecnico T è ASSEGNATO a una card se vale ALMENO UNO:
1. card.techName === T (primario)
2. T in card.techNames[] (co-primari)
3. card.labels[].name === T (label co-coinvolto)

Fix:
1. Nella query, dopo aver cercato per techName e techNames, fai ANCHE scan per labels[].name
2. Unisci i risultati (dedup per card ID)
3. Per l'esempio: "interventi di Marco oggi" deve trovare la card Depretis (Marco è in labels)

Testa con nexusTestInternal:
- "interventi di Marco oggi" → deve trovare la card Depretis se Marco è nelle labels
- "interventi di Lorenzo oggi" → deve trovare la card Depretis (Lorenzo è techName primario)

Deploy + test + email report.
Committa con "fix(ares): cerca tecnici anche in labels[] (222 card recuperate)"
