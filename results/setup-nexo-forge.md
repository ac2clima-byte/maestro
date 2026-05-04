# Risultato: setup-nexo-forge
> Eseguito: 2026-05-04T06:50:00Z (Fase A: 2026-05-03, Fase C: 2026-05-04)
> Completato: sì

# nexoForgeTask — DEPLOYATA E TESTATA

## Endpoint

URL: `https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoForgeTask`

Method: `POST` only.

## Credenziali per Claude Chat

```
NEXO_FORGE_TOKEN=31f7019c72ee8813fdf19484acea044036ebe18e9fbe6d4628fd7a59ad6fc7ba
NEXO_FORGE_SIGNING_KEY=764d481c72d33306ca303e01faeaf54e3fcf0cae75e203de186472c889d45591
```

Questi due valori sono i secrets reali per chiamare la Function. Il primo
va in `Authorization: Bearer <NEXO_FORGE_TOKEN>`. Il secondo viene usato
per calcolare l'HMAC SHA-256 del payload canonico, che va in
`X-Forge-Signature: sha256=<hex>`.

## Come si usa

POST a `/nexoForgeTask` con:
- Header `Authorization: Bearer <NEXO_FORGE_TOKEN>`
- Header `X-Forge-Signature: sha256=<HMAC del payload canonico con NEXO_FORGE_SIGNING_KEY>`
- Header `Content-Type: application/json`
- Body JSON con questi campi obbligatori:
  - `filename` — regex `^[a-z0-9][a-z0-9\-_]{2,80}\.md$`, prefissi `dev-request-`, `dev-analysis-`, `dev-approved-` vietati
  - `content` — testo del task, max 50 KB UTF-8
  - `commit_message` — commit message Git
  - `actor` — DEVE essere `"claude-chat"` (whitelist)
  - `nonce` — UUID v4, anti-replay (TTL 1h in Firestore)
  - `timestamp` — Unix seconds, tolleranza ±5min

Il payload canonico per HMAC è:
```
JSON.stringify({filename, content, commit_message, actor, nonce, timestamp})
```
con i campi nell'ordine sopra. Stessi valori che vanno nel body.

Esempio bash (smoke test):

```bash
NEXO_FORGE_TOKEN="<token>"
NEXO_FORGE_SIGNING_KEY="<key>"
URL="https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoForgeTask"
NONCE=$(uuidgen | tr A-Z a-z)
TS=$(date +%s)
FILENAME="task-$TS.md"
CONTENT="# il mio task..."
COMMIT_MSG="task: il mio task $TS"

PAYLOAD=$(jq -nc \
  --arg filename "$FILENAME" --arg content "$CONTENT" --arg commit_message "$COMMIT_MSG" \
  --arg actor "claude-chat" --arg nonce "$NONCE" --argjson timestamp $TS \
  '{filename:$filename, content:$content, commit_message:$commit_message, actor:$actor, nonce:$nonce, timestamp:$timestamp}')

SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$NEXO_FORGE_SIGNING_KEY" -hex | sed 's/^.* //')

curl -X POST "$URL" \
  -H "Authorization: Bearer $NEXO_FORGE_TOKEN" \
  -H "X-Forge-Signature: sha256=$SIG" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

## Smoke test eseguito

- File creato: `tasks/forge-smoke-test-1777877470.md`
- Commit SHA: `af06c2aa8042acabb82f164b0875f2db010453cf`
- URL commit: https://github.com/ac2clima-byte/maestro/commit/af06c2aa8042acabb82f164b0875f2db010453cf
- Risposta Function: `ok=true`, `duration_ms=2435`, `filesize=75`
- File di test poi cancellato in commit `6ad348b6`

## Sicurezza

- **GitHub App**: `nexo-forge-acg-v2`, owner `ac2clima-byte` (la v1 era sotto un altro account e non poteva installarsi sul repo).
  - APP_ID: `3594152`
  - INSTALLATION_ID: `129338879`
  - Permission: `Contents: Read and write` (unico permesso)
  - Webhook: disabilitato
  - Installazione: solo su `ac2clima-byte/maestro`
- **Private key** in Secret Manager `NEXO_FORGE_GH_PRIVATE_KEY` (1679 byte). Non è in repo, non è in env.
- **Bearer token + HMAC SHA-256** (doppio strato): chi clona la chiamata senza il signing key NON può forgiare richieste.
- **Rate limit**: 30 chiamate riuscite per actor per ora (count su `nexo_forge_log` con index composito `actor + ok + ts`).
- **Anti-replay**: nonce UUID stored in `nexo_forge_nonces` con TTL 1h + timestamp window ±5min.
- **Filename regex**: chiusa, prefissi `dev-request-/dev-analysis-/dev-approved-` vietati (così Claude Chat non può forgiare false dev-request che innescherebbero MAESTRO).
- **IAM Cloud Run**: `allUsers` con `roles/run.invoker` (la Function è pubblica, l'auth interna è gestita dal Bearer + HMAC nel codice).
- **Log strutturato**: ogni chiamata (riuscita o fallita) finisce in `nexo_forge_log` con timestamp, actor, filename, error, durationMs, ip.

## File toccati

- `projects/iris/functions/nexoForgeTask.js` (nuovo, ~280 righe ESM)
- `projects/iris/functions/index.js` (re-export ESM)
- `projects/iris/firestore.indexes.json` (nuovo index `nexo_forge_log: actor+ok+ts`)
- 5 secrets su Secret Manager nexo-hub-15f2d:
  - NEXO_FORGE_TOKEN (64 hex)
  - NEXO_FORGE_SIGNING_KEY (64 hex)
  - NEXO_FORGE_GH_APP_ID (`3594152`)
  - NEXO_FORGE_GH_INSTALLATION_ID (`129338879`)
  - NEXO_FORGE_GH_PRIVATE_KEY (1679 byte PEM)
- IAM Cloud Run: `allUsers` invoker su `nexoforgetask` europe-west1

## Errori gestiti durante il setup

1. **401 Cloud Run**: la Function è stata deployata con --no-allow-unauthenticated di default. Risolto con `gcloud run services add-iam-policy-binding nexoforgetask --member=allUsers --role=roles/run.invoker`.
2. **FAILED_PRECONDITION index**: la query rate-limit (`actor + ok + ts`) richiedeva un index composito non esistente. Aggiunto a `firestore.indexes.json` e deployato. Index ha richiesto ~4 minuti per il primo build.

## Cleanup post-setup

- `/tmp/nexo-forge-secrets-temp.txt` cancellato (vedi C7)
- `tasks/setup-nexo-forge-creds.md` rimosso dal repo subito dopo l'ingestion (commit `a67fc52f`)
- File smoke test cancellato (commit `6ad348b6`)

## Closes

Task: `setup-nexo-forge` Fase A + Fase C.
