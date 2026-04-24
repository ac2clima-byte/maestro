Il flusso preventivo si ferma all'analisi — NEXUS capisce ma non agisce. Implementa il workflow COMPLETO.

Quando Alberto conferma "sì" dopo l'analisi email, o scrive "prepara il preventivo per De Amicis intestato a 3i efficientamento":

## Passo 1 — Cerca azienda committente in rete

In handlers/memo.js o handlers/shared.js:
- Prendi la P.IVA estratta dall'email (02486680065)
- Cerca i dati aziendali completi. Opzioni:
  a. Chiama un servizio gratuito di verifica P.IVA (es. https://www.registroimprese.it, o OpenAPI VIES per verifica EU)
  b. Usa Claude Haiku con web search tool per cercare "3i efficientamento energetico P.IVA 02486680065 sede legale PEC"
  c. Se nessun servizio disponibile: chiedi a Haiku di generare una ricerca e estrarre i dati
- Dati da trovare: ragione sociale completa, indirizzo sede legale, PEC, codice SDI/destinatario, telefono
- Salva in memo_dossier/azienda_3i_efficientamento (cache per il futuro)
- Se non trova tutto: usa almeno quello che ha dall'email (ragione sociale + P.IVA)

## Passo 2 — Cerca condominio nel CRM

In handlers/memo.js:
- Cerca "De Amicis" in COSMINA (garbymobile-f89ac):
  - cosmina_impianti: cerca per indirizzo o nome condominio
  - crm_clienti: cerca per nome
- Estrai: indirizzo completo, impianti installati (tipo, marca, modello, potenza), amministratore
- Se non trova: usa "Condominio De Amicis" come nome generico

## Passo 3 — CALLIOPE genera la bozza

In handlers/calliope.js:
- Chiama Claude Sonnet con prompt:
  "Genera un preventivo per ACG Clima Service S.R.L. con questi dati:
  
  INTESTATARIO:
  [dati azienda dal Passo 1]
  
  OGGETTO: Verifica impianto di riscaldamento
  LUOGO: Condominio De Amicis, [indirizzo dal Passo 2]
  
  IMPIANTI (se trovati nel CRM):
  [lista impianti dal Passo 2]
  
  Genera il preventivo con:
  - Intestazione ACG Clima Service S.R.L.
  - Data odierna
  - Numero preventivo progressivo
  - Voci di lavoro standard per verifica riscaldamento
  - Condizioni di pagamento standard
  - Firma: Alberto Contardi
  
  Formato: JSON strutturato con campi intestatario, oggetto, voci (descrizione, quantita, prezzo_unitario, totale), totale_imponibile, iva, totale, condizioni, note"

- Salva la bozza in calliope_bozze con stato="da_approvare"

## Passo 4 — Mostra in NEXUS Chat

- Mostra ad Alberto il preventivo formattato nella chat:
  "📄 PREVENTIVO preparato:
  
  Intestatario: 3i efficientamento energetico S.r.l.
  P.IVA: 02486680065
  Sede: [indirizzo trovato]
  
  Oggetto: Verifica impianto riscaldamento - Condominio De Amicis
  
  Voci:
  1. Sopralluogo e verifica impianto - €XXX
  2. Relazione tecnica - €XXX
  ...
  
  Totale: €X.XXX + IVA
  
  ✅ Approva  |  ✏️ Modifica  |  ❌ Rifiuta"

- Se Alberto risponde "approva" o "ok":
  → GRAPH genera il PDF (se disponibile) o salva come documento finale
  → ECHO manda email a Torriglia con il preventivo allegato (CC Poggi come nel thread originale)
  → Rispondi "Preventivo inviato a davide.torriglia@gruppo3i.it (CC: massimo.poggi@guazzottienergia.com) ✅"

- Se Alberto risponde "modifica: [istruzioni]":
  → CALLIOPE rigenera con le modifiche
  → Mostra di nuovo per approvazione

- Se Alberto risponde "rifiuta":
  → Chiudi workflow, segna bozza come rifiutata

## Passo 5 — Registro

- Salva il preventivo approvato in charta_preventivi (nuova collection) con:
  numero, data, intestatario, oggetto, importo, stato (inviato/approvato/rifiutato), email_id_origine
- MEMO aggiorna il dossier: "Preventivo inviato a 3i per verifica De Amicis il [data]"

## Test

Con Playwright:
1. Apri NEXUS Chat
2. Scrivi "prepara il preventivo per De Amicis intestato a 3i efficientamento"
3. Aspetta che NEXUS esegua tutti i passi
4. Screenshot di ogni passo
5. Analizza gli screenshot e scrivi il risultato testuale
6. Verifica che calliope_bozze abbia la bozza

Deploy functions.
Committa con "feat(nexo): workflow preventivo completo - ricerca + bozza + approvazione"
