# CHRONOS — Collega Pianificatore

**Stato:** Da costruire (Tier 1 nel piano NEXO).

**Dominio:** tempo e disponibilità. Unico responsabile di "quando".
Possiede l'agenda di ogni tecnico, conosce le scadenze manutenzione
periodica, le campagne stagionali (accensione/spegnimento), i conflitti.

## Cosa fa (azioni esposte)

- `slotDisponibili(criteri)` — ricerca slot per zona/competenza/durata
- `agendaGiornaliera(tecnicoUid, data)` — vista per ECHO/briefing
- `agendaSettimanale(tecnicoUid, weekISO)` — vista a 7 giorni
- `prenotaSlot(slot)` — blocca uno slot per un intervento (chiamata da ARES)
- `liberaSlot(slotId)` — annullamento
- `scadenzeProssime(zona, finestra)` — manutenzioni periodiche prossime
- `scadenzeScadute(zona)` — manutenzioni già scadute non chiuse
- `pianificaCampagna(anno, comuni, tipo)` — batch da `cosmina_campagne`
- `trovaConflitti(data, tecnicoUid)`
- `riprogramma(slotId, nuovaData, motivo)`
- `ottimizzaGiornata(tecnicoUid, data)` — rotta + ordinamento
- `registraFerie(tecnicoUid, dal, al, note?)`
- `registraMalattia(tecnicoUid, dal, al?)`

## Riceve dalla Lavagna

- `richiesta_slot` — ARES → CHRONOS
- `scadenza_normativa` — DIKEA → CHRONOS
- `richiesta_riprogrammazione` — qualsiasi → CHRONOS

## Scrive sulla Lavagna

- `slot_proposto` → ARES (risposta a `richiesta_slot`)
- `avviso_scadenza` → ECHO
- `conflitto_rilevato` → ARES

## Non fa

- Non apre interventi (lo fa **ARES**).
- Non gestisce clienti / dossier (lo fa **MEMO**).
- Non manda notifiche (lo fa **ECHO**).

## Collections Firestore

- `chronos_agende` — slot per tecnico + data (collezione hot)
- `chronos_scadenze` — manutenzioni periodiche, scadenze contrattuali
- `chronos_campagne` — pianificazione campagne stagionali

## App toccate

COSMINA, KANT, Guazzotti TEC. Possibile integrazione futura con Google
Calendar API.

## Stack

Node.js + TypeScript (ESM, strict). Dipendenze rilevanti:

- `firebase-admin` — Firestore (sia `nexo-hub-15f2d` che il progetto
  COSMINA per leggere `cosmina_impianti.prossima_scadenza`)

## Ambiente

Vedi `.env.example`. Variabili richieste:

- `FIREBASE_PROJECT_ID=nexo-hub-15f2d` (collections nexo)
- `COSMINA_PROJECT_ID=acg-clima-service` (lettura impianti per scadenze)
- `ORE_LAVORATIVE_GIORNO=8` (default per ottimizzazioni)
- `DRY_RUN=false` — se `true`, prenotazioni/riprogrammazioni vengono
  loggate ma non scritte realmente

## Sviluppo

```bash
npm install
npm run dev        # tsx watch su src/index.ts
npm test           # vitest
npm run build      # tsc → dist/
```

## TODO v0.1

- [ ] Modello slot quantizzato (slot da 30 min) + persistenza
- [ ] Algoritmo `slotDisponibili` con vincoli zona/competenza/carico
- [ ] Sync periodica scadenze da `cosmina_impianti.prossima_scadenza`
- [ ] Listener Lavagna + status machine pending → completed
- [ ] Vista calendario per la PWA
