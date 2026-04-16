# Claude Code — Inventario Ambiente

**Generato**: 2026-04-16 20:05 GMT+2
**Working dir**: `/home/albertocontardi/maestro-bridge`
**OS**: Ubuntu 24.04.3 LTS su WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2)
**Host**: NBACG01

---

## 1. MCP Servers attivi

Dallo stato corrente di `claude mcp list`:

| Server | Tipo | Endpoint / Path | Stato |
|---|---|---|---|
| `claude.ai Gmail` | HTTP/SSE | `https://gmail.mcp.claude.com/mcp` | ✓ Connected |
| `claude.ai Google Calendar` | HTTP/SSE | `https://gcal.mcp.claude.com/mcp` | ✓ Connected |
| `claude.ai Atlassian` | HTTP/SSE | `https://mcp.atlassian.com/v1/sse` | ⚠ Needs authentication |
| `claude.ai PlayMCP` | HTTP/SSE | `https://playmcp.kakao.com/mcp` | ⚠ Needs authentication |
| `plugin:claude-mem:mcp-search` | stdio | `~/.claude/plugins/cache/thedotmack/claude-mem/10.3.1/scripts/mcp-server.cjs` | ✓ Connected |

**Tool esposti dagli MCP connessi (visibili nella sessione corrente come deferred tools):**

- **Gmail** (`mcp__claude_ai_Gmail__*`): `gmail_create_draft`, `gmail_get_profile`, `gmail_list_drafts`, `gmail_list_labels`, `gmail_read_message`, `gmail_read_thread`, `gmail_search_messages`
- **Google Calendar** (`mcp__claude_ai_Google_Calendar__*`): `create_event`, `delete_event`, `get_event`, `list_calendars`, `list_events`, `respond_to_event`, `suggest_time`, `update_event`
- **Atlassian** (`mcp__claude_ai_Atlassian__*`): `authenticate`, `complete_authentication` (richiede auth per il resto)
- **PlayMCP** (`mcp__claude_ai_PlayMCP__*`): `authenticate`, `complete_authentication` (richiede auth per il resto)
- **claude-mem** (`mcp__plugin_claude-mem_mcp-search__*`): `search`, `get_observations`, `timeline`, `save_memory`, `___IMPORTANT`

**Server MCP citati nei `permissions.allow` ma NON attivi in questa sessione** (configurati a livello progetto altrove): `mcp__acg-browser__*` (open_app, screenshot, navigate, run_js, fill, click, wait, get_console_logs, get_page_info, browser_status, browser_close, get_network_requests, firestore_query, firestore_get, firestore_update, firestore_add) — risulta configurato in `acg_suite/` ma non in questo repo.

**File di configurazione MCP**:
- Globale: `~/.claude.json` → chiavi `mcpServers` (vuota a livello root), `projects.<path>.mcpServers`
- Cache auth: `~/.claude/mcp-needs-auth-cache.json`

---

## 2. Skill installate

### Skill utente (`~/.claude/skills/`)
**367 skill** totali (escluso `_archived/` e file `Zone.Identifier`). Categorie principali:

- **ACG-specific**: `acg-firestore-ops`, `acg-security-check`, `acg-suite-login`, `cosmina-bacheca-modal`, `cosmina-listener-hunt`, `pwa-tecnici`, `campagna-spegnimento`, `campagna-test-snapshot`, `condominium-contratti-check`, `cartella-cliente`, `magazzino-ops`, `suite-monitoring`, `hermes-launch`, `hermes-restart`, `canon-print`, `send-mail`
- **Workflow & meta**: `supercycle`, `debug-escalation`, `first-ask`, `boost-prompt`, `remember`, `memory-merger`, `end-session`, `plannotator`, `ralph`, `ralphmode`, `jeo`, `omc`, `oh-my-codex`, `ohmg`
- **Engineering generale**: `code-review`, `code-refactoring`, `refactor`, `refactor-plan`, `debugging`, `git-workflow`, `git-commit`, `git-flow-branch-creator`, `gh-cli`, `git-submodule`, `vet`, `simplify` (sistema)
- **Linguaggi/framework**: `csharp-*` (mstest/nunit/xunit/tunit/async/docs/mcp), `java-*` (junit, springboot, docs, refactoring, mcp, graalvm), `kotlin-*`, `go-mcp-server-generator`, `rust-mcp-server-generator`, `swift-mcp-server-generator`, `php-mcp-server-generator`, `ruby-mcp-server-generator`, `python-mcp-server-generator`, `typescript-mcp-server-generator`, `dotnet-best-practices`, `dotnet-upgrade`, `ef-core`, `aspire`, `aspnet-minimal-api-openapi`, `vanilla-web`, `zero-build-frontend`, `react-best-practices`, `vercel-react-*`, `expo-*`, `building-native-ui`, `genkit`, `firebase-ai-logic`
- **Cloud & Azure**: `az-*`, `azure-*` (deployment-preflight, resource-health-diagnose, resource-visualizer, role-selector, static-web-apps, devops-cli, pricing), `appinsights-instrumentation`, `entra-agent-user`, `update-avm-modules-in-bicep`, `terraform-azurerm-set-diff-analyzer`, `import-infrastructure-as-code`
- **Microsoft 365 / Power Platform**: `dataverse-python-*`, `power-apps-*`, `power-bi-*`, `power-platform-*`, `flowstudio-power-automate-mcp`, `mcp-copilot-studio-*`, `copilot-*`, `declarative-agents`, `typespec-*`, `fluentui-blazor`, `winapp-cli`, `winmd-api-search`, `winui3-migration-guide`, `vscode-ext-*`, `msstore-cli`
- **Web/Frontend**: `frontend-design`, `web-coder`, `web-design-guidelines`, `web-design-reviewer`, `web-accessibility`, `web-artifacts-builder`, `webapp-testing`, `responsive-design`, `ui-component-patterns`, `state-management`, `design-system`, `theme-factory`, `brand-guidelines`, `chrome-devtools`, `agent-browser`, `agentation`, `playwright-*` (explore-website, automation-fill-in-form, generate-test), `scoutqa-test`, `next-intl-add-language`, `markdown-to-html`, `create-web-form`
- **Marketing/CRO/Growth**: `ad-creative`, `cold-email`, `copywriting`, `copy-editing`, `content-strategy`, `email-sequence`, `paid-ads`, `paywall-upgrade-cro`, `popup-cro`, `signup-flow-cro`, `onboarding-cro`, `form-cro`, `page-cro`, `ab-test-setup`, `analytics-tracking`, `competitor-alternatives`, `referral-program`, `revops`, `sales-enablement`, `seo-audit`, `ai-seo`, `programmatic-seo`, `schema-markup`, `site-architecture`, `social-content`, `pricing-strategy`, `marketing-automation`, `marketing-ideas`, `marketing-psychology`, `launch-strategy`, `free-tool-strategy`, `internal-comms`, `product-marketing-context`, `churn-prevention`
- **Documenti & dati**: `pdf`, `pdf-generator`, `pdftk-server`, `pdforge`, `docx`, `pptx`, `xlsx`, `presentation-builder`, `convert-plaintext-to-md`, `markdown-to-html`, `excalidraw-diagram-generator`, `plantuml-ascii`, `image-generation`, `image-manipulation-image-magick`, `nano-banana-pro-openrouter`, `pollinations-ai`, `slack-gif-creator`, `video-production`, `transloadit-media-processing`, `algorithmic-art`, `canvas-design`, `legacy-circuit-mockups`, `game-engine`
- **Specifiche & Issues GitHub**: `create-specification`, `update-specification`, `create-implementation-plan`, `update-implementation-plan`, `create-architectural-decision-record`, `create-technical-spike`, `create-github-issue-feature-from-specification`, `create-github-issues-feature-from-implementation-plan`, `create-github-issues-for-unmet-specification-requirements`, `create-github-pull-request-from-specification`, `create-github-action-workflow-specification`, `gen-specs-as-issues`, `github-issues`, `my-issues`, `my-pull-requests`, `repo-story-time`
- **Database/SQL**: `sql-code-review`, `sql-optimization`, `postgresql-code-review`, `postgresql-optimization`, `supabase-postgres-best-practices`, `cosmosdb-datamodeling`, `database-schema-design`, `snowflake-semanticview`, `looker-studio-bigquery`, `bigquery-pipeline-audit`, `datanalysis-credit-risk`, `data-analysis`
- **Testing**: `backend-testing`, `breakdown-test`, `polyglot-test-agent`, `pytest-coverage`, `javascript-typescript-jest`, `testing-strategies`
- **DevOps**: `deployment-automation`, `deploy-to-vercel`, `vercel-deploy`, `devops-rollout-plan`, `multi-stage-dockerfile`, `containerize-aspnetcore`, `containerize-aspnet-framework`, `environment-setup`, `system-environment-setup`, `workflow-automation`, `mcp-cli`, `mcp-builder`, `mcp-configure`, `npm-git-install`, `nuget-manager`
- **Linux triage**: `arch-linux-triage`, `centos-linux-triage`, `debian-linux-triage`, `fedora-linux-triage`, `log-analysis`, `monitoring-observability`, `performance-optimization`
- **Documentazione & blueprints**: `documentation-writer`, `technical-writing`, `user-guide-writing`, `api-documentation`, `api-design`, `meeting-minutes`, `standup-meeting`, `sprint-retrospective`, `task-planning`, `task-estimation`, `mentoring-juniors`, `tldr-prompt`, `create-tldr-page`, `create-readme`, `create-llms`, `update-llms`, `create-agentsmd`, `architecture-blueprint-generator`, `code-exemplars-blueprint-generator`, `copilot-instructions-blueprint-generator`, `folder-structure-blueprint-generator`, `project-workflow-analysis-blueprint-generator`, `readme-blueprint-generator`, `technology-stack-blueprint-generator`, `update-markdown-file-index`, `update-oo-component-documentation`, `create-oo-component-documentation`
- **Sicurezza & compliance**: `security-best-practices`, `ai-prompt-engineering-safety-review`, `ai-tool-compliance`, `apple-appstore-reviewer`, `agent-governance`, `agent-evaluation`, `agentic-eval`
- **AI/agent dev**: `claude-api`, `agentic-development-principles`, `agentic-workflow`, `prompt-builder`, `prompt-repetition`, `finalize-agent-prompt`, `noob-mode`, `quasi-coder`, `vibe-kanban`, `model-recommendation`, `llm-monitoring-dashboard`, `microsoft-skill-creator`, `skill-creator`, `skill-standardization`, `make-skill-template`, `find-skills`, `template-skill`, `suggest-awesome-github-copilot-*` (agents/instructions/prompts/skills), `github-copilot-starter`, `copilot-cli-quickstart`, `copilot-coding-agent`, `copilot-spaces`, `copilot-sdk`, `copilot-usage-metrics`, `mcp-create-declarative-agent`, `mcp-create-adaptive-cards`, `mcp-deploy-manage-agents`, `microsoft-docs`, `microsoft-code-reference`
- **Misc**: `bmad-gds`, `bmad-idea`, `bmad-orchestrator`, `breakdown-epic-arch`, `breakdown-epic-pm`, `breakdown-feature-implementation`, `breakdown-feature-prd`, `breakdown-plan`, `make-repo-contribution`, `prd`, `editorconfig`, `ohmg`, `omc`, `jeo`, `opencontext`, `shuffle-json-data`, `sponsor-finder`, `pattern-detection`, `audit-website`, `pwa-tecnici`, `web-coder`, `csharp-mcp-server-generator`, `kotlin-mcp-server-generator`, `kotlin-springboot`, `java-springboot`, `dotnet-design-pattern-review`, `power-bi-report-design-consultation`, `mkdocs-translations`, `comment-code-generate-a-tutorial`, `add-educational-comments`, `write-coding-standards-from-file`, `code-refactoring`, `refactor-method-complexity-reduce`, `review-and-refactor`, `power-bi-performance-troubleshooting`, `power-bi-dax-optimization`, `power-bi-model-design-review`, `powerbi-modeling`, `fabric-lakehouse`, `dataverse-python-quickstart`, `power-platform-mcp-connector-suite`, `update-implementation-plan`, `what-context-needed`, `vscode-ext-commands`, `vscode-ext-localization`, `winapp-cli`, `winmd-api-search`, `vet`

> Indice completo: `ls ~/.claude/skills/`

### Skill da plugin (namespace `plugin:`)
- `ralph-wiggum:cancel-ralph`, `ralph-wiggum:help`, `ralph-wiggum:ralph-loop`
- `claude-mem:do`, `claude-mem:make-plan`, `claude-mem:mem-search`
- `hookify:hookify`, `hookify:help`, `hookify:list`, `hookify:configure`, `hookify:writing-rules`
- `claude-md-management:revise-claude-md`, `claude-md-management:claude-md-improver`
- `claude-code-setup:claude-automation-recommender`
- `frontend-design:frontend-design`

### Skill di sistema/integrate (esempi disponibili in questa sessione)
`update-config`, `keybindings-help`, `simplify`, `less-permission-prompts`, `loop`, `schedule`, `init`, `review`, `security-review`, `end-session`.

---

## 3. Comandi slash custom

### Globali utente (`~/.claude/commands/`)
- `/end-session` — retrospettiva SuperCycle a 6 fasi (file `end-session.md`)

### Plugin (esposti come slash)
- `/ralph-wiggum:cancel-ralph`, `/ralph-wiggum:help`, `/ralph-wiggum:ralph-loop`
- `/claude-mem:do`, `/claude-mem:make-plan`, `/claude-mem:mem-search`
- `/hookify:hookify`, `/hookify:help`, `/hookify:list`, `/hookify:configure`, `/hookify:writing-rules`
- `/claude-md-management:revise-claude-md`, `/claude-md-management:claude-md-improver`
- `/claude-code-setup:claude-automation-recommender`
- `/frontend-design:frontend-design`

### Built-in CLI (non personalizzati)
`/help`, `/clear`, `/fast`, `/loop`, `/schedule`, `/end-session`, `/init`, `/review`, `/security-review` ecc. — invocati direttamente dalla CLI.

---

## 4. Tool di sistema disponibili

### Sempre caricati (tool stabili nel prompt)
- **File system**: `Read`, `Write`, `Edit`, `Glob`, `Grep`
- **Shell**: `Bash` (sandboxed, con timeout 120s default e `run_in_background`)
- **Orchestrazione**: `Agent` (sub-agent), `Skill` (invoca skill), `ToolSearch` (carica schema dei deferred tool), `ScheduleWakeup`

### Deferred (caricabili via `ToolSearch`)
`AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `EnterWorktree`, `ExitWorktree`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop`, `TaskUpdate`, `TeamCreate`, `TeamDelete`, `SendMessage`, `Monitor`, `PushNotification`, `RemoteTrigger`, `CronCreate`, `CronDelete`, `CronList`, `WebFetch`, `WebSearch`, `NotebookEdit`, più tutti i tool MCP elencati sopra.

---

## 5. Browser / Playwright

- **Playwright CLI**: versione **1.59.1** (via `npx playwright`)
- **Browser scaricati** in `~/.cache/ms-playwright/`:
  - `chromium-1091`
  - `chromium-1200`
  - `chromium-1217` ← **ultima** (Chrome for Testing 147.0.7727.15)
  - `chromium_headless_shell-1200`
  - `chromium_headless_shell-1217`
  - `ffmpeg-1009`, `ffmpeg-1011`
- **Pacchetto npm**: `playwright` installato localmente in `maestro-bridge/node_modules/` (no `--save`)
- Nota: `chrome-devtools` skill disponibile per debug avanzato.

---

## 6. Node.js e npm

- **Node**: `v20.20.1`
- **npm**: `10.8.2`
- **Bun**: `1.3.9` (in `~/.bun/bin/bun`)
- **Corepack**: `0.34.6` (gestione yarn/pnpm)
- **Deno**: non installato

---

## 7. Git

- **Versione**: `git version 2.43.0`
- **user.name** (global): `Alberto Contardi`
- **user.email** (global): `albertocontardi@acgclimaservice.com`
- Branch corrente in `maestro-bridge`: `main`

---

## 8. Linguaggi e runtime

| Linguaggio | Versione | Note |
|---|---|---|
| Python | 3.12.3 | system; `pip3` disponibile |
| Node.js | 20.20.1 | LTS |
| Go | 1.22.2 linux/amd64 | |
| Bun | 1.3.9 | runtime alternativo |
| Rust | ❌ non installato | `rustc` non presente |
| Java | ❌ non installato | |
| Ruby | ❌ non installato | |
| Deno | ❌ non installato | |
| Docker | presente in `/mnt/c/Program Files/Docker/Docker/resources/bin/docker` (Docker Desktop Windows) | |

---

## 9. Pacchetti npm globali (`npm list -g --depth=0`)

```
/usr/lib
├── @anthropic-ai/claude-code@2.1.81
├── corepack@0.34.6
├── firebase-tools@14.26.0
├── nexo-maestro@0.1.0 -> ./../../home/albertocontardi/nexo-maestro  (linked, locale)
└── npm@10.8.2
```

---

## 10. Pacchetti pip (selezione rilevante)

**Totale**: 275 pacchetti installati a livello system. Highlight per il dominio:

- **AI/LLM**: `anthropic 0.49.0`, `huggingface_hub 1.7.1`, `accelerate 1.13.0`, `ctranslate2 4.7.1`, `faster-whisper 1.2.1`, `edge-tts 7.2.7`, `av 17.0.0`
- **Google Cloud / Firebase**: `firebase_admin 7.1.0`, `google-cloud-firestore 2.26.0`, `google-cloud-storage 3.10.1`, `google-cloud-secret-manager 2.27.0`, `google-cloud-documentai 3.10.0`, `google-api-core 2.29.0`, `google-auth 2.48.0`, `gspread 6.2.1`
- **Web/API**: `fastapi 0.115.0`, `httpx 0.28.1`, `aiohttp 3.13.3`, `httpcore 1.0.9`, `httptools 0.7.1`, `httplib2 0.20.4`
- **Document processing**: `docling 2.85.0` + sub (`docling-core`, `docling-ibm-models`, `docling-parse`), `docx2txt 0.9`
- **Email/Exchange**: `exchangelib 5.6.0`, `email-validator 2.3.0`
- **Scheduling**: `APScheduler 3.11.2`
- **CUDA bindings**: `cuda-bindings 13.2.0`, `cuda-pathfinder 1.5.2`, `cuda-toolkit 13.0.2`
- **Util**: `Faker 40.13.0`, `bcrypt 3.2.2`, `cryptography 41.0.7`

> Lista completa: `pip3 list`

---

## 11. Hooks configurati

Da `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/hermes-review.sh" }
        ]
      }
    ]
  }
}
```

- **Hook attivo**: `~/.claude/hooks/hermes-review.sh` — invocato dopo ogni `Edit` o `Write`. Inoltra le modifiche all'app **HERMES** (Electron Windows in `/mnt/c/HERMES/`) per security review su file sensibili (`storage.rules`, `firestore.rules`, ecc.).
- **Hook session-start**: presente come `SessionStart` hook (visibile dal contesto iniettato a inizio sessione).

---

## 12. Impostazioni Claude Code

### Modello & sessione
- **Modello attivo**: Opus 4.7 1M context (`claude-opus-4-7[1m]`)
- **Knowledge cutoff**: gennaio 2026
- **Permission mode**: corrente non mostrato esplicitamente; il setting `skipDangerousModePermissionPrompt: true` indica che il prompt di conferma per modalità pericolosa è disattivato.
- **Always-thinking**: `false` (extended thinking on-demand)

### File di config
- `~/.claude/settings.json` — impostazioni globali utente (hooks, statusLine, plugins, modello)
- `~/.claude/settings.local.json` — allowlist permission *enorme* (~180 voci) per Bash, MCP `acg-browser`, Gmail, GCal, gcloud, firebase, file Windows
- `~/maestro-bridge/.claude/settings.local.json` — allowlist locale di progetto (Bash playwright/node/npm/pip3/runtime versions)
- `~/.claude.json` — config root (mcpServers per progetto/globale)
- `~/.claude/CLAUDE.md` — istruzioni globali utente: **SuperCycle obbligatorio**, brainstorming-first, regola anti-tunnel, session context da template
- `~/CLAUDE.md` — project instructions (ACG Suite ecosystem reference: COSMINA, Guazzotti, GRAPH, KANT, Diogene, CosminaMobile, DARWIN, HERMES)

### Plugin abilitati (`enabledPlugins`)
- `ralph-wiggum@claude-code-plugins` (v1.0.0)
- `claude-mem@thedotmack` (v10.3.1) — memory system + MCP `mcp-search`
- `hookify@claude-code-plugins` (v0.1.0)
- `claude-code-setup@claude-plugins-official` (v1.0.0)
- `claude-md-management@claude-plugins-official` (v1.0.0)
- `frontend-design@claude-plugins-official` (unknown)

### Marketplaces installati
`claude-code-plugins`, `claude-plugins-official`, `thedotmack`, `thedotmack-claude-mem` (più un `.bak`).

### Status line
Comando custom: `~/.claude/statusline.sh` (backup `statusline.sh.bak-suite-monitoring` presente).

### Memory system
- `~/.claude/projects/-home-albertocontardi-maestro-bridge/memory/` — auto-memory file-based (user/feedback/project/reference)
- `~/.claude/projects/-home-albertocontardi/sessions/` — log di sessione SuperCycle (uno per sessione)
- `~/.claude/plugins/cache/thedotmack/claude-mem/` — claude-mem semantic index (cross-session)

---

## Note operative per task futuri

1. **Italiano** è la lingua di default (utente, codice, UI).
2. **Comunicazione e timezone**: GMT+2.
3. **Working dir progetto attivo**: `/home/albertocontardi/maestro-bridge` (git repo, branch `main`, clean).
4. **Codebase principale del lavoro reale** (ACG Suite) sta in `~/acg_suite/` — leggere `~/acg_suite/CLAUDE.md` prima di operarci.
5. **Hook hermes-review.sh** può rallentare/bloccare alcuni `Edit`/`Write` su file sensibili — se un edit sembra pendere, controlla `/mnt/c/HERMES/pending-review/`.
6. **Browser MCP `acg-browser`** è disponibile *solo* nei progetti ACG configurati, non in `maestro-bridge`. Per automazione web qui usa Playwright locale.
7. **SuperCycle skill** obbligatorio: prima di qualsiasi task → Predictive Shield report + brainstorming. Per task triviali (es. creare file fisso come questo) si applica con buon senso.
