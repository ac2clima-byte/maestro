# Setup nexoForgeTask — Cloud Function bridge Claude Chat → GitHub (con GitHub App)

## Contesto

Claude Chat (la sessione web/app) non può pushare su GitHub: la sua sandbox
è effimera e non ha credenziali persistenti. Oggi ogni task deve passare via
Alberto (copia-incolla in WSL).

Questa Cloud Function risolve il problema: Claude Chat la chiama via HTTPS,
le passa il contenuto di un task, e la Function scrive il file in `tasks/`
del repo `ac2clima-byte/maestro` via API GitHub. MAESTRO continua a fare
polling come oggi — niente cambia lato suo.

L'autenticazione verso GitHub usa una **GitHub App** (non un PAT) per evitare
scadenze annuali e migliorare audit/granularità.

## Stack

- Firebase project: `nexo-hub-15f2d`
- Region: `europe-west1`
- Runtime: Node 20
- Framework: `firebase-functions` v2 HTTP onRequest
- Secrets: Google Secret Manager
- GitHub auth: GitHub App con JWT → installation token short-lived

## Workflow di setup (3 fasi)

**Fase A — Claude Code autonomo (questo task, prima parte):**
1. Crea la struttura della Function nel codebase functions di nexo-hub
2. Genera due secrets casuali locali (`NEXO_FORGE_TOKEN`, `NEXO_FORGE_SIGNING_KEY`)
3. Li salva su Secret Manager
4. Scrive in `results/setup-nexo-forge.md` le istruzioni per Alberto su come creare la GitHub App
5. **Si ferma e aspetta**

**Fase B — Alberto (4 click in browser, ~2 minuti):**
1. Apre il link diretto alla creazione GitHub App
2. Compila i campi suggeriti
3. Genera private key e la salva
4. Installa l'App sul repo `ac2clima-byte/maestro`
5. Crea un task `tasks/setup-nexo-forge-creds.md` con APP_ID + INSTALLATION_ID + path della private key, e lo pusha

**Fase C — Claude Code autonomo (continuazione, triggered da setup-nexo-forge-creds):**
1. Salva i 3 secrets della GitHub App su Secret Manager
2. Cancella il file con le credenziali dal repo (sicurezza)
3. Completa il deploy della Function
4. Test smoke end-to-end
5. Scrive `results/setup-nexo-forge.md` definitivo
6. Committa e pusha

## Path di deploy

Cerca il codebase Cloud Functions di **nexo-hub-15f2d**. Probabili location:
- `~/nexo-maestro/functions/`
- `~/test-maestro/functions/`
- `~/nexo-hub/functions/`

Se non esiste, crealo con `firebase init functions` selezionando il progetto
`nexo-hub-15f2d`. Runtime Node 20.

Crea il file `nexoForgeTask.js` nella cartella functions e importalo da `index.js`.

## Codice della Function

```javascript
// functions/nexoForgeTask.js
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

if (getApps().length === 0) initializeApp();

// Secrets gestiti da Secret Manager
const FORGE_TOKEN = defineSecret("NEXO_FORGE_TOKEN");
const SIGNING_KEY = defineSecret("NEXO_FORGE_SIGNING_KEY");
const GH_APP_ID = defineSecret("NEXO_FORGE_GH_APP_ID");
const GH_INSTALLATION_ID = defineSecret("NEXO_FORGE_GH_INSTALLATION_ID");
const GH_PRIVATE_KEY = defineSecret("NEXO_FORGE_GH_PRIVATE_KEY");

const REPO_OWNER = "ac2clima-byte";
const REPO_NAME = "maestro";
const ALLOWED_ACTORS = new Set(["claude-chat"]);
const FILENAME_RE = /^[a-z0-9][a-z0-9\-_]{2,80}\.md$/;
const FORBIDDEN_PREFIXES = ["dev-request-", "dev-analysis-", "dev-approved-"];
const MAX_CONTENT_BYTES = 50 * 1024;
const TIMESTAMP_TOLERANCE_SEC = 300;
const NONCE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 30;

// Cache installation token in memoria (TTL 50 min, GitHub li dà 1h)
let cachedInstallationToken = null;
let cachedInstallationTokenExp = 0;

exports.nexoForgeTask = onRequest(
  {
    region: "europe-west1",
    secrets: [FORGE_TOKEN, SIGNING_KEY, GH_APP_ID, GH_INSTALLATION_ID, GH_PRIVATE_KEY],
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 5,
  },
  async (req, res) => {
    const startMs = Date.now();
    const db = getFirestore();
    let logEntry = {
      ts: FieldValue.serverTimestamp(),
      method: req.method,
      ip: req.ip,
      ok: false,
    };

    try {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "method_not_allowed" });
      }

      // 1. Bearer token
      const authHeader = req.get("authorization") || "";
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (!bearerMatch) {
        logEntry.error = "missing_bearer";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }
      const presentedToken = bearerMatch[1].trim();
      if (!constantTimeEqual(presentedToken, FORGE_TOKEN.value())) {
        logEntry.error = "bad_bearer";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }

      // 2. Body shape
      const body = req.body || {};
      const { filename, content, commit_message, actor, nonce, timestamp } = body;
      if (!filename || !content || !commit_message || !actor || !nonce || !timestamp) {
        logEntry.error = "bad_payload";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }
      logEntry.actor = actor;
      logEntry.filename = filename;
      logEntry.nonce = nonce;

      // 3. HMAC signature on canonical payload
      const sigHeader = req.get("x-forge-signature") || "";
      const sigMatch = /^sha256=([a-f0-9]{64})$/i.exec(sigHeader);
      if (!sigMatch) {
        logEntry.error = "missing_sig";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "bad_signature" });
      }
      const presentedSig = sigMatch[1].toLowerCase();
      const canonical = JSON.stringify({
        filename, content, commit_message, actor, nonce, timestamp,
      });
      const expectedSig = crypto
        .createHmac("sha256", SIGNING_KEY.value())
        .update(canonical)
        .digest("hex");
      if (!constantTimeEqual(presentedSig, expectedSig)) {
        logEntry.error = "bad_sig";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(401).json({ ok: false, error: "bad_signature" });
      }

      // 4. Actor whitelist
      if (!ALLOWED_ACTORS.has(actor)) {
        logEntry.error = "actor_not_allowed";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(403).json({ ok: false, error: "actor_not_allowed" });
      }

      // 5. Timestamp window
      const tsNum = Number(timestamp);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > TIMESTAMP_TOLERANCE_SEC) {
        logEntry.error = "timestamp_skew";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(400).json({ ok: false, error: "timestamp_skew" });
      }

      // 6. Filename validation
      if (!FILENAME_RE.test(filename)) {
        logEntry.error = "bad_filename";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(400).json({ ok: false, error: "bad_filename" });
      }
      for (const p of FORBIDDEN_PREFIXES) {
        if (filename.startsWith(p)) {
          logEntry.error = "forbidden_prefix";
          await db.collection("nexo_forge_log").add(logEntry);
          return res.status(400).json({ ok: false, error: "forbidden_prefix" });
        }
      }

      // 7. Content size
      const contentBytes = Buffer.byteLength(content, "utf8");
      if (contentBytes > MAX_CONTENT_BYTES) {
        logEntry.error = "content_too_large";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(413).json({ ok: false, error: "content_too_large" });
      }

      // 8. Nonce replay check
      const nonceRef = db.collection("nexo_forge_nonces").doc(nonce);
      const nonceSnap = await nonceRef.get();
      if (nonceSnap.exists) {
        logEntry.error = "nonce_replay";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(409).json({ ok: false, error: "nonce_replay" });
      }
      await nonceRef.set({
        actor,
        filename,
        usedAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + NONCE_TTL_MS),
      });

      // 9. Rate limit per actor (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const rlSnap = await db
        .collection("nexo_forge_log")
        .where("actor", "==", actor)
        .where("ok", "==", true)
        .where("ts", ">=", oneHourAgo)
        .count()
        .get();
      if (rlSnap.data().count >= RATE_LIMIT_PER_HOUR) {
        logEntry.error = "rate_limit";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(429).json({ ok: false, error: "rate_limit" });
      }

      // 10. Get installation token (cached) e committa via API GitHub
      const ghToken = await getInstallationToken();
      const path = `tasks/${filename}`;
      const ghBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(path)}`;

      // 10a. Check non-overwrite
      const checkResp = await fetch(ghBase, { headers: ghHeaders(ghToken) });
      if (checkResp.status === 200) {
        logEntry.error = "file_exists";
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(409).json({ ok: false, error: "file_exists", path });
      }
      if (checkResp.status !== 404) {
        const txt = await checkResp.text();
        logEntry.error = `github_check_${checkResp.status}`;
        logEntry.detail = txt.slice(0, 300);
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(502).json({ ok: false, error: "github_unreachable" });
      }

      // 10b. Create file
      const putResp = await fetch(ghBase, {
        method: "PUT",
        headers: { ...ghHeaders(ghToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commit_message,
          content: Buffer.from(content, "utf8").toString("base64"),
          branch: "main",
        }),
      });
      if (!putResp.ok) {
        const txt = await putResp.text();
        logEntry.error = `github_put_${putResp.status}`;
        logEntry.detail = txt.slice(0, 300);
        await db.collection("nexo_forge_log").add(logEntry);
        return res.status(502).json({
          ok: false,
          error: "github_write_failed",
          status: putResp.status,
          detail: txt.slice(0, 300),
        });
      }

      const ghData = await putResp.json();
      const sha = ghData.commit?.sha;
      const url = ghData.commit?.html_url;

      // 11. Success log
      logEntry.ok = true;
      logEntry.commitSha = sha;
      logEntry.filesize = contentBytes;
      logEntry.durationMs = Date.now() - startMs;
      delete logEntry.error;
      await db.collection("nexo_forge_log").add(logEntry);

      return res.status(200).json({
        ok: true,
        filename,
        path,
        commit_sha: sha,
        commit_url: url,
        filesize: contentBytes,
        duration_ms: logEntry.durationMs,
      });
    } catch (err) {
      logEntry.error = "exception";
      logEntry.detail = String(err?.message || err).slice(0, 500);
      try { await db.collection("nexo_forge_log").add(logEntry); } catch {}
      return res.status(500).json({ ok: false, error: "internal" });
    }
  }
);

// ─── GitHub App auth helpers ────────────────────────────────────

async function getInstallationToken() {
  if (cachedInstallationToken && Date.now() < cachedInstallationTokenExp - 60_000) {
    return cachedInstallationToken;
  }
  const appJwt = generateAppJwt();
  const installationId = GH_INSTALLATION_ID.value();
  const resp = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${appJwt}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nexoForgeTask/1.0",
      },
    }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`installation_token_failed: ${resp.status} ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  cachedInstallationToken = data.token;
  cachedInstallationTokenExp = new Date(data.expires_at).getTime();
  return cachedInstallationToken;
}

function generateAppJwt() {
  const appId = GH_APP_ID.value();
  const privateKey = GH_PRIVATE_KEY.value();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 30,
    exp: now + 9 * 60,
    iss: appId,
  };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${signingInput}.${b64urlBuf(signature)}`;
}

function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlBuf(buf) {
  return buf.toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function ghHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nexoForgeTask/1.0",
  };
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
```

## Index.js

Aggiungi in `functions/index.js`:

```javascript
exports.nexoForgeTask = require("./nexoForgeTask").nexoForgeTask;
```

## Fase A — Esecuzione iniziale (Claude Code)

### A1. Genera e salva i due secrets locali

```bash
cd <root del codebase functions di nexo-hub>

NEXO_FORGE_TOKEN=$(openssl rand -hex 32)
NEXO_FORGE_SIGNING_KEY=$(openssl rand -hex 32)

mkdir -p /tmp
echo "TOKEN=$NEXO_FORGE_TOKEN" > /tmp/nexo-forge-secrets-temp.txt
echo "SIGNING_KEY=$NEXO_FORGE_SIGNING_KEY" >> /tmp/nexo-forge-secrets-temp.txt
chmod 600 /tmp/nexo-forge-secrets-temp.txt

echo -n "$NEXO_FORGE_TOKEN" | firebase functions:secrets:set NEXO_FORGE_TOKEN --project=nexo-hub-15f2d --data-file=-
echo -n "$NEXO_FORGE_SIGNING_KEY" | firebase functions:secrets:set NEXO_FORGE_SIGNING_KEY --project=nexo-hub-15f2d --data-file=-
```

### A2. Crea i tre placeholder per i secrets della GitHub App

```bash
echo -n "PENDING" | firebase functions:secrets:set NEXO_FORGE_GH_APP_ID --project=nexo-hub-15f2d --data-file=-
echo -n "PENDING" | firebase functions:secrets:set NEXO_FORGE_GH_INSTALLATION_ID --project=nexo-hub-15f2d --data-file=-
echo -n "PENDING" | firebase functions:secrets:set NEXO_FORGE_GH_PRIVATE_KEY --project=nexo-hub-15f2d --data-file=-
```

### A3. Crea i file Function

Crea `functions/nexoForgeTask.js` con il codice sopra.
Aggiungi l'export in `functions/index.js`.

### A4. NON deployare ancora

Aspetta Fase C.

### A5. Scrivi `results/setup-nexo-forge.md` (versione intermedia)

Crea il file con esattamente questo contenuto:

```markdown
# nexoForgeTask — setup IN CORSO

## Stato: in attesa di GitHub App da Alberto

## Cosa Claude Code ha fatto (Fase A)
- ✅ File Function creato: `functions/nexoForgeTask.js`
- ✅ Import aggiunto in `functions/index.js`
- ✅ Secret `NEXO_FORGE_TOKEN` salvato su Secret Manager
- ✅ Secret `NEXO_FORGE_SIGNING_KEY` salvato su Secret Manager
- ⏳ Secrets `NEXO_FORGE_GH_APP_ID`, `NEXO_FORGE_GH_INSTALLATION_ID`, `NEXO_FORGE_GH_PRIVATE_KEY` con valore PENDING
- ⏳ Function NON ancora deployata

## Cosa deve fare Alberto adesso (Fase B — ~2 minuti)

### 1. Apri questo link per creare la GitHub App
https://github.com/settings/apps/new

### 2. Compila i campi così
- **GitHub App name**: `nexo-forge-acg`
  (deve essere globalmente unico; se preso, prova `nexo-forge-acg-2`)
- **Homepage URL**: `https://nexo-hub-15f2d.web.app`
- **Webhook**: **DESELEZIONA "Active"** (non ci serve webhook)
- **Repository permissions**:
  - **Contents: Read and write** ← UNICO permesso da impostare
  - Tutto il resto: No access
- **Where can this GitHub App be installed?**: **Only on this account**

Premi **Create GitHub App** in fondo.

### 3. Genera la private key
Sulla pagina dell'App appena creata, scrolla in fondo a "Private keys" e
premi **Generate a private key**. Si scaricherà un `.pem`.

Spostalo in `~/.nexo-forge-gh-app.pem`:
```bash
mv ~/Downloads/nexo-forge-acg.*.private-key.pem ~/.nexo-forge-gh-app.pem
chmod 600 ~/.nexo-forge-gh-app.pem
```

### 4. Annota l'App ID
In cima alla pagina dell'App, sotto "About", c'è **App ID** (un numero). Copialo.

### 5. Installa l'App sul repo `maestro`
Sidebar sinistra → **Install App** → account `ac2clima-byte` → **Only select repositories** → spunta solo `maestro` → **Install**.

L'URL finale sarà tipo `https://github.com/settings/installations/12345678`.
Quel numero finale è l'**Installation ID**. Copialo.

### 6. Comunica i tre valori a Claude Code

Crea `tasks/setup-nexo-forge-creds.md` nel repo `maestro` con questo contenuto:

```
# Credenziali GitHub App per nexo-forge

APP_ID: <incolla qui l'App ID>
INSTALLATION_ID: <incolla qui l'Installation ID>
PRIVATE_KEY_PATH: ~/.nexo-forge-gh-app.pem
```

Poi pusha:
```bash
cd <repo maestro>
git add tasks/setup-nexo-forge-creds.md
git commit -m "task: setup-nexo-forge-creds"
git push origin main
```

MAESTRO eseguirà questo task, che farà partire la Fase C automaticamente.
```

### A6. Committa e pusha lo stato Fase A

```bash
cd <repo maestro>
git add functions/nexoForgeTask.js functions/index.js results/setup-nexo-forge.md
git commit -m "feat(forge): nexoForgeTask Fase A (file + secrets locali, in attesa GitHub App)"
git push origin main
```

## Fase C — Esecuzione finale (al ricevimento di setup-nexo-forge-creds)

Quando Alberto pusha `tasks/setup-nexo-forge-creds.md`, MAESTRO lancerà
Claude Code che eseguirà QUESTO task come Fase C.

**IMPORTANTE: il task `setup-nexo-forge-creds` è la prosecuzione di
`setup-nexo-forge`. Quando vedi quel file, esegui esattamente questi passi.**

### C1. Leggi le credenziali e salvale su Secret Manager

```bash
APP_ID=$(grep ^APP_ID tasks/setup-nexo-forge-creds.md | sed 's/APP_ID: //')
INSTALLATION_ID=$(grep ^INSTALLATION_ID tasks/setup-nexo-forge-creds.md | sed 's/INSTALLATION_ID: //')
PEM_PATH=$(grep ^PRIVATE_KEY_PATH tasks/setup-nexo-forge-creds.md | sed 's/PRIVATE_KEY_PATH: //' | sed "s|^~|$HOME|")

echo -n "$APP_ID" | firebase functions:secrets:set NEXO_FORGE_GH_APP_ID --project=nexo-hub-15f2d --data-file=-
echo -n "$INSTALLATION_ID" | firebase functions:secrets:set NEXO_FORGE_GH_INSTALLATION_ID --project=nexo-hub-15f2d --data-file=-
cat "$PEM_PATH" | firebase functions:secrets:set NEXO_FORGE_GH_PRIVATE_KEY --project=nexo-hub-15f2d --data-file=-
```

### C2. Cancella subito il file con le credenziali (sicurezza)

```bash
rm tasks/setup-nexo-forge-creds.md
git add -A
git commit -m "chore(forge): rimuove setup-nexo-forge-creds dopo ingestion"
git push origin main
```

### C3. Deploya la Function

```bash
firebase deploy --only functions:nexoForgeTask --project=nexo-hub-15f2d
```

(O usa il `deploy.sh` se nexo-hub ne ha uno.)

### C4. Test smoke end-to-end

```bash
NEXO_FORGE_TOKEN=$(firebase functions:secrets:access NEXO_FORGE_TOKEN --project=nexo-hub-15f2d)
NEXO_FORGE_SIGNING_KEY=$(firebase functions:secrets:access NEXO_FORGE_SIGNING_KEY --project=nexo-hub-15f2d)

URL="https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoForgeTask"
NONCE=$(uuidgen | tr A-Z a-z)
TS=$(date +%s)
FILENAME="forge-smoke-test-$TS.md"
CONTENT="# Smoke test
Test della Cloud Function nexoForgeTask.
Timestamp: $TS"
COMMIT_MSG="test: nexo-forge smoke test $TS"

PAYLOAD=$(jq -nc \
  --arg filename "$FILENAME" \
  --arg content "$CONTENT" \
  --arg commit_message "$COMMIT_MSG" \
  --arg actor "claude-chat" \
  --arg nonce "$NONCE" \
  --argjson timestamp $TS \
  '{filename: $filename, content: $content, commit_message: $commit_message, actor: $actor, nonce: $nonce, timestamp: $timestamp}')

SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$NEXO_FORGE_SIGNING_KEY" -hex | sed 's/^.* //')

RESPONSE=$(curl -sS -X POST "$URL" \
  -H "Authorization: Bearer $NEXO_FORGE_TOKEN" \
  -H "X-Forge-Signature: sha256=$SIG" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "Risposta: $RESPONSE"

echo "$RESPONSE" | jq -e '.ok == true' > /dev/null || {
  echo "TEST FALLITO"
  echo "$RESPONSE"
  exit 1
}
echo "TEST OK"

# Pulizia: cancella il file di test
sleep 5
git pull origin main
rm "tasks/$FILENAME" 2>/dev/null || true
git add -A
git commit -m "chore: rimuove file smoke test forge" 2>/dev/null || true
git push origin main
```

### C5. Scrivi `results/setup-nexo-forge.md` definitivo (sovrascrive Fase A)

```markdown
# nexoForgeTask — DEPLOYATA E TESTATA

## Endpoint
URL: https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoForgeTask

## Credenziali per Claude Chat

NEXO_FORGE_TOKEN=<valore reale da Secret Manager>
NEXO_FORGE_SIGNING_KEY=<valore reale da Secret Manager>

## Come si usa

POST a `/nexoForgeTask` con:
- Header `Authorization: Bearer <NEXO_FORGE_TOKEN>`
- Header `X-Forge-Signature: sha256=<HMAC del payload con NEXO_FORGE_SIGNING_KEY>`
- Body JSON: `{filename, content, commit_message, actor, nonce, timestamp}`
- `actor` deve essere `"claude-chat"`
- `filename` regex `^[a-z0-9][a-z0-9\-_]{2,80}\.md$`
- `nonce` deve essere unico (UUID v4)
- `timestamp` Unix seconds, tolleranza ±5 min

## Test smoke
- File creato: tasks/forge-smoke-test-NNNN.md (poi cancellato)
- Commit SHA: ...
- Risposta Function: ok=true, duration_ms ~XXX

## Sicurezza
- GitHub App `nexo-forge-acg` installata su `ac2clima-byte/maestro` con `Contents: Read and write`
- Private key in Secret Manager `NEXO_FORGE_GH_PRIVATE_KEY`
- Bearer token + HMAC SHA-256 (doppio strato)
- Rate limit: 30 chiamate/h per actor
- Anti-replay: nonce + timestamp window
- Filename regex chiusa, prefissi `dev-request-/dev-analysis-/dev-approved-` vietati
- Log: collection `nexo_forge_log`
```

### C6. Committa e pusha

```bash
git add results/setup-nexo-forge.md
git commit -m "feat(forge): nexoForgeTask deployata e testata (Fase C completa)"
git push origin main
```

### C7. Pulisci

```bash
rm /tmp/nexo-forge-secrets-temp.txt
```

## Cose che NON devi fare

- Non committare la private key `.pem` in repo
- Non lasciare `tasks/setup-nexo-forge-creds.md` in repo dopo l'ingestion
- Non scrivere i valori dei secrets in chiaro in commit messages o nei log
- Non aggiungere endpoint GET (single-purpose)
- Non saltare la verifica HMAC
- Non usare PAT come fallback se la GitHub App fallisce — fermati e segnala

## Se qualcosa fallisce

Scrivi in `results/setup-nexo-forge.md` esattamente quale step ha fallito,
l'errore testuale, e i log Firebase. Niente workaround creativi.

## Trigger di Fase C

Il task `setup-nexo-forge-creds.md` è il trigger per Fase C. Quando vedi
quel file, esegui Fase C come descritto sopra. L'istruzione completa è già
qui in questo file.
