Testa il flusso completo del preventivo con l'email di Torriglia.

1. Verifica che l'email di Torriglia sia in iris_emails:
   - Cerca email con sender contenente "torriglia" o oggetto "Verifica riscaldamento condominio De Amicis"
   - Se NON esiste: importala manualmente eseguendo la pipeline IRIS (python3 projects/iris/scripts/pipeline.py)
   - Se la pipeline non funziona, crea un documento di test in iris_emails con questi dati:
     sender: "Davide Torriglia <davide.torriglia@gruppo3i.it>"
     subject: "R: Verifica riscaldamento condominio De Amicis"
     body: "Buongiorno Alberto\n\n* 3i efficientamento energetico S.r.l. Società Benefit - P.IVA 02486680065\n\nSaluti\nDavide"
     thread_body: "Da: Alberto Contardi - ACG Clima Service Srl\nOggetto: Verifica riscaldamento condominio De Amicis\n\nBuongiorno, come da accordi richiedo la corretta intestazione la ns offerta di verifica.\n\nCordiali saluti, Contardi Alberto"
     date: "2026-04-23"
     category: "RISPOSTA_INFORMATIVA"

2. Apri NEXUS Chat con Playwright (https://nexo-hub-15f2d.web.app)

3. Scrivi: "analizza l'ultima mail di Torriglia"

4. Aspetta la risposta di NEXUS (fino a 30 secondi)

5. Screenshot della risposta

6. Analizza lo screenshot e scrivi testualmente cosa ha risposto NEXUS:
   - Ha trovato l'email?
   - Ha capito l'intent? (dovrebbe essere "preparare_preventivo")
   - Ha estratto i dati? (3i efficientamento, P.IVA, De Amicis)
   - Ha proposto un'azione?

7. Se NEXUS non ha capito o ha risposto male, stampa l'errore

8. Secondo test: scrivi "prepara il preventivo per De Amicis intestato a 3i efficientamento"
   - Screenshot e analisi

9. Salva il report in results/test-preventivo-torriglia.html
10. Apri nel browser

11. Committa con "test: flusso preventivo Torriglia end-to-end"
