Implementa i fix dei 3 bug da analisi dev-analysis-e9KNWku90w4akhyBr0Ec.md.

Bug A: Dettatura vocale manda testo incrementale. La speech recognition deve mandare SOLO il risultato finale (event.results[i].isFinal === true), non gli interim.

Bug A2: tryAnalyzeLongText intercetta rumore della dettatura e produce risposte inutili. Filtrare meglio.

Bug B: "Che interventi ci sono oggi" (senza tecnico) finisce su crea_intervento. Aggiungere regex L1 per "interventi oggi" / "che interventi ci sono" senza tecnico → handleAresInterventiAperti con tutti i tecnici.

Implementa come da analisi. Deploy + test + email report.
Committa con "fix(nexus): dettatura solo finale + routing interventi senza tecnico"
