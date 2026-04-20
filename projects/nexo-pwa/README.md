# NEXO — PWA unificata

Single-page app che fa da hub a tutti i Colleghi NEXO.

- **Sidebar** con 10 Colleghi: IRIS, ARES, CHRONOS, MEMO, CHARTA,
  EMPORION, DIKEA, DELPHI, PHARO, CALLIOPE.
- **Home** = dashboard NEXO con widget:
  - Stato Lavagna (ultimi 10 messaggi `nexo_lavagna`)
  - Alert attivi (placeholder per PHARO; oggi mostra
    `echo_notifications` come segnalazione)
  - Digest email (top 3 + contatori da `iris_emails`)
  - Interventi aperti (placeholder per ARES)
- **IRIS** è incorporato come iframe sulla pagina IRIS originale
  (`/iris/`) — niente porting, niente regressioni.
- **Altri Colleghi** mostrano una card "in costruzione" col loro
  README quando esistono.

Auth: Firebase Auth bypassato in dev (MOCK_MODE = true), pattern
identico alla PWA IRIS originale.

## Deploy

```bash
cd projects/nexo-pwa
npx firebase-tools deploy --only hosting --project nexo-hub-15f2d
```

Sostituisce l'hosting precedente che puntava alla PWA IRIS.
La PWA IRIS legacy resta in `projects/iris/pwa/` ma non è più deployata.
