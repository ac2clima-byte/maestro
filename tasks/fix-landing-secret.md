Completa i 2 fix rimasti dal task precedente (timeout).

## 1. Landing ACG — Rimuovi noSSO
- Modifica ~/acg_suite/COSMINA/firebase/landing/index.html
- Trova la card NEXO in APPS[] e rimuovi noSSO: true
- Deploy: cd ~/acg_suite/COSMINA/firebase && ./deploy.sh acgsuite
- Se fallisce per quota hosting: elimina release vecchie dalla console Firebase
- Committa nel repo acg_suite

## 2. Secret Manager — API key Anthropic
- Verifica: gcloud secrets describe ANTHROPIC_API_KEY --project=nexo-hub-15f2d 2>&1
- Se non esiste: leggi la key da projects/iris/.env o dal codice, poi:
  printf '%s' "LA_KEY_QUI" | gcloud secrets create ANTHROPIC_API_KEY --data-file=- --project=nexo-hub-15f2d --replication-policy=automatic
- Se esiste ma va aggiornata:
  printf '%s' "LA_KEY_QUI" | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=- --project=nexo-hub-15f2d
- Rideploya functions: cd projects/iris && firebase deploy --only functions
- Testa: curl nexusRouter con una query

## 3. Verifica finale
- Apri https://acgsuite.web.app → click NEXO → deve passare per SSO
- Apri https://nexo-hub-15f2d.web.app → deve chiedere login
- NEXUS Chat funziona dopo login
- Committa con "fix: landing SSO + Secret Manager completati"
