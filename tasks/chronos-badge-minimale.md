I badge CHRONOS sono troppo grandi. Servono MINIMALI perché le attività monitorate saranno molte (decine).

Design badge minimale:

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ WalkBy ACG   │ │ Spegnimento  │ │ WalkBy GZT   │ │ Riempimenti  │
│ 26%  25/97   │ │ 100% 405/407 │ │ 0%    0/13   │ │ 0%    0/0    │
│ ██████░░░░░░ │ │ ████████████ │ │ ░░░░░░░░░░░░ │ │ ░░░░░░░░░░░░ │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Ogni badge:
- Altezza FISSA piccola (~80px max)
- Larghezza: 150-180px
- Riga 1: nome (troncato con ellipsis se lungo)
- Riga 2: percentuale + completati/totale
- Riga 3: barra progresso sottile (4px)
- Bordo sinistro colorato: verde >80%, giallo 50-80%, rosso <50%, grigio 0%
- Nessun dettaglio extra (programmati, scaduti ecc.) — quelli si vedono cliccando o via NEXUS Chat

Griglia: CSS grid con auto-fill, minmax(150px, 1fr) — si adatta automaticamente a quanti badge ci sono.
Su mobile: 2 colonne. Su desktop: 4-6 colonne.

Per le sezioni non-campagna (Agenda, Scadenze) stesso formato:
┌──────────────┐ ┌──────────────┐
│ Agenda oggi  │ │ Scadenze 30g │
│ 5 interventi │ │ 3 in scadenz │
│ ████████████ │ │ ██░░░░░░░░░░ │
└──────────────┘ └──────────────┘

Rimuovi tutto il design precedente (tab, card grandi, dettagli).
Rideploya hosting.
Committa con "feat(chronos): badge minimali compatti"
