MEMO deve conoscere TUTTI i clienti di COSMINA, non solo la struttura della collection.

## 1. Scansione completa clienti

Crea uno script: scripts/memo_carica_clienti.py

1. Connettiti a Firestore garbymobile-f89ac
2. Leggi TUTTI i documenti dalla collection clienti (crm_clienti o quella che MEMO ha mappato in memo-firestore-garbymobile.md)
3. Per ogni cliente estrai: id, nome, indirizzo, telefono, email, condominio/i associati, tipo (privato/condominio/azienda), amministratore, contratto attivo
4. Leggi TUTTI gli impianti da cosmina_impianti e collegali ai clienti
5. Salva tutto in nexo-hub Firestore collection memo_clienti_cache:
   - Un documento per cliente con tutti i dati + impianti collegati
   - Campo ultima_scansione con timestamp
6. Salva anche un riassunto in context/memo-clienti-cosmina.md con:
   - Numero totale clienti
   - Lista clienti con nome e condominio (tabella)
   - Top clienti per numero impianti
7. Stampa a console quanti clienti e impianti ha trovato

## 2. Aggiorna handler MEMO nel nexusRouter

In handlers/memo.js:
- Quando NEXUS chiede "dimmi tutto su [nome]":
  - PRIMA cerca in memo_clienti_cache (nexo-hub) — risposta istantanea
  - Se non trova: query live su COSMINA → salva in cache → rispondi
- La cache ha TTL 24h: se ultima_scansione > 24h, riscansiona quel cliente

## 3. Cloud Function di refresh

Crea Cloud Function schedulata memoCacheRefresh:
- Gira ogni notte alle 03:00
- Riscansiona tutti i clienti da COSMINA
- Aggiorna memo_clienti_cache
- Log: "MEMO cache aggiornata: X clienti, Y impianti"

## 4. Testa

- NEXUS: "quanti clienti abbiamo?"
- NEXUS: "dimmi tutto su Kristal"
- NEXUS: "clienti con più impianti"
- NEXUS: "cerca cliente Via Roma 12"
- Verifica che le risposte siano istantanee (dalla cache)

## 5. Deploy
## 6. Committa con "feat(memo): cache completa clienti COSMINA"
