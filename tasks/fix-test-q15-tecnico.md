Nel task forge-test-severi-e-fix.md, il test Q15 usa "Malvicino" come tecnico ma Malvicino NON è un tecnico ACG. È personale ufficio Guazzotti.

I tecnici ACG sono: Marco Piparo, Victor Dellafiore, Lorenzo Dellafiore, David Aime, Tosca Federico, Troise Antonio, Berberi Ergest.

Fix:
1. Cambia Q15 da "agenda di Malvicino domani" a "agenda di Marco domani" (Marco Piparo, tecnico ACG)
2. Nel sistema NEXUS/CHRONOS, quando si cerca l'agenda di un tecnico, cercare nella bacheca_cards di COSMINA filtrate per tecnico
3. NEXUS deve sapere chi sono i tecnici ACG — se qualcuno chiede "agenda di Malvicino" deve rispondere "Malvicino non è un tecnico ACG, è personale ufficio Guazzotti"

Committa con "fix: Q15 usa tecnico ACG corretto (Marco)"
