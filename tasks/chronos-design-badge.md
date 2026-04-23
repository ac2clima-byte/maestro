Il design di CHRONOS non va bene con le tab. Alberto vuole BADGE QUADRATI.

Ogni elemento controllato (campagna, agenda, scadenza) è un BADGE quadrato nella pagina, tipo card KPI.

Esempio per le campagne:

┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│ Letture WalkBy ACG 2026 │  │ SPEGNIMENTO 2026        │  │ Letture WalkBy GZT 2026 │
│                         │  │                         │  │                         │
│     26%                 │  │    100%                 │  │     0%                  │
│  ██████░░░░░░░░░░░░░░   │  │  ████████████████████   │  │  ░░░░░░░░░░░░░░░░░░░░   │
│                         │  │                         │  │                         │
│  97 totali              │  │  407 totali             │  │  13 totali              │
│  25 completati          │  │  405 completati         │  │  0 completati           │
│  55 programmati         │  │  0 programmati          │  │  0 programmati          │
│  17 da programmare      │  │  2 scaduti              │  │  4 scaduti              │
└─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘

Stessa cosa per Agenda e Scadenze:

┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│ AGENDA OGGI             │  │ SCADENZE PROSSIME       │  │ SLOT LIBERI             │
│                         │  │                         │  │                         │
│  📅 5 interventi        │  │  ⚠️ 3 in scadenza       │  │  ✅ 12 slot liberi      │
│  MARCO: 3               │  │  nei prossimi 30gg      │  │  questa settimana       │
│  VICTOR: 2              │  │                         │  │                         │
└─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘

IMPLEMENTAZIONE:

1. Rimuovi le tab dalla pagina CHRONOS nella PWA
2. Crea una griglia di badge quadrati (CSS grid, 3 colonne su desktop, 1 su mobile)
3. Ogni badge è una card con:
   - Titolo (nome campagna o nome elemento)
   - Barra progresso colorata con percentuale
   - Numeri chiave sotto
   - Bordo colorato: verde se >80%, giallo 50-80%, rosso <50%, grigio se 0%
4. Sezione CAMPAGNE: un badge per ogni campagna attiva
5. Sezione OPERATIVO: badge Agenda Oggi + badge Scadenze Prossime + badge Slot Liberi
6. Ogni badge carica i dati dalla Cloud Function (stesso handler, solo UI diversa)
7. Design: sfondo bianco, ombre leggere, bordi arrotondati, mobile-first
8. Rideploya hosting
9. Committa con "feat(chronos): design badge quadrati per campagne e operativo"
