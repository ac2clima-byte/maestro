PREREQUISITO: dopo completamento-echo-ares-polling.

Completa ciò che Sprint 4 non ha finito (timeout).

1. CALLIOPE — Contesto automatico:
   In handlers/calliope.js: quando "scrivi risposta a [nome]", cerca automaticamente in iris_emails l'ultima email di quel mittente e usa il contesto.
   Max 150 righe.

2. DELPHI — KPI cross-source:
   In handlers/delphi.js: aggrega da iris_emails + COSMINA interventi + Guazzotti pagamenti_clienti.
   Calcola: email ricevute, interventi aperti/chiusi, esposizione totale, RTI pendenti.
   Max 200 righe.

3. NEXUS — Contesto conversazionale:
   In handlers/nexus.js: carica ultimi 5 messaggi della sessione nel prompt Haiku.
   Max 30 righe aggiuntive.

4. Digest mattutino:
   Crea functions/scheduled/digest.js: ogni giorno alle 07:30 raccoglie dati da IRIS + ARES + PHARO, manda WA ad Alberto.
   Max 100 righe. DRY_RUN di default.

Committa modulare.
