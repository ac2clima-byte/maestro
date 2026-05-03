# nexoForgeTask — setup IN CORSO

## Stato: in attesa di GitHub App da Alberto

## Cosa Claude Code ha fatto (Fase A)
- ✅ File Function creato: `projects/iris/functions/nexoForgeTask.js` (ESM, adattato dal codice CommonJS del task perché il codebase è `"type":"module"`)
- ✅ Re-export ESM aggiunto in `projects/iris/functions/index.js` (`export { nexoForgeTask } from "./nexoForgeTask.js";`)
- ✅ Secret `NEXO_FORGE_TOKEN` salvato su Secret Manager (versione 1, 64 hex chars)
- ✅ Secret `NEXO_FORGE_SIGNING_KEY` salvato su Secret Manager (versione 1, 64 hex chars)
- ⏳ Secrets `NEXO_FORGE_GH_APP_ID`, `NEXO_FORGE_GH_INSTALLATION_ID`, `NEXO_FORGE_GH_PRIVATE_KEY` con valore PENDING (3 placeholder già creati, vanno popolati in Fase C)
- ⏳ Function NON ancora deployata (deploy in Fase C, dopo che la GitHub App è pronta e i 3 secrets sono popolati)

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
cd /home/albertocontardi/maestro-bridge
git add tasks/setup-nexo-forge-creds.md
git commit -m "task: setup-nexo-forge-creds"
git push origin main
```

MAESTRO eseguirà questo task, che farà partire la Fase C automaticamente.

## Note tecniche

- Il file `/tmp/nexo-forge-secrets-temp.txt` contiene i due secrets locali in chiaro (chmod 600). Verrà cancellato in Fase C7.
- Il codebase Cloud Functions è `projects/iris/functions/` (`.firebaserc` punta a `nexo-hub-15f2d`). Tutte le altre Functions sono ESM → ho mantenuto coerenza.
- Niente PAT come fallback. Se la GitHub App fallisce in Fase C, fermo e segnalo.
