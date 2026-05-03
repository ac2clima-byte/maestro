import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import admin from 'firebase-admin';

// === CONFIG ===
const POLL_INTERVAL = 15_000;
const REPO_DIR = process.cwd();
const TASKS_DIR = join(REPO_DIR, 'tasks');
const RESULTS_DIR = join(REPO_DIR, 'results');
const TMUX_SESSION = 'claude-code';
const PROMPT_TIMEOUT = 600_000;
const RESULT_TIMEOUT = 600_000;
const FIREBASE_PROJECT = 'nexo-hub-15f2d';
const STATUS_COLLECTION = 'nexo_code_status';
const STATUS_DOC = 'current';

// === ENSURE DIRS ===
[TASKS_DIR, RESULTS_DIR].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

// === FIRESTORE STATUS ===
let _db = null;
function getDb() {
  if (_db) return _db;
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: FIREBASE_PROJECT });
  }
  _db = admin.firestore();
  return _db;
}

// Firestore: write su nexo_code_status/current ad ogni cambio fase (cheap).
// STATUS.md: write+push periodico ogni N cicli (vedi STATUS_REPORT_EVERY).
async function updateStatus(fase, dettagli = {}) {
  try {
    const db = getDb();
    await db.collection(STATUS_COLLECTION).doc(STATUS_DOC).set({
      fase,
      task: dettagli.task || null,
      dettagli: dettagli.msg || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      uptime: process.uptime(),
    }, { merge: true });
  } catch (e) {
    console.error(`[STATUS ERROR] ${e.message}`);
  }
}

// === STATUS.md REPORT (ogni 2 minuti) ===
// Aggregato leggibile da Claude Chat via `git pull && cat STATUS.md`:
//   - codeStatus letto dalla Cloud Function (stessa fonte della dashboard)
//   - lista task pendenti dalla cartella tasks/
//   - ultimi 5 commit del repo
const STATUS_FILE = join(REPO_DIR, 'STATUS.md');
const CODE_STATUS_URL = 'https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/codeStatus';
// Ogni 8 cicli × POLL_INTERVAL (15s) = ~2 minuti
const STATUS_REPORT_EVERY = 8;

function fetchCodeStatus() {
  try {
    const out = execSync(`curl -fsS --max-time 8 ${CODE_STATUS_URL}`, {
      encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (e) {
    return { error: 'fetch_failed', detail: String(e.message || e).slice(0, 200) };
  }
}

function listPendingTasksForReport() {
  if (!existsSync(TASKS_DIR)) return [];
  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const id = f.replace('.md', '');
    if (id.startsWith('dev-analysis-')) continue;
    if (id.startsWith('dev-request-')) {
      const devId = id.replace(/^dev-request-/, '');
      if (existsSync(join(TASKS_DIR, `dev-analysis-${devId}.md`))) continue;
      out.push(`${id} (dev-request)`);
      continue;
    }
    if (existsSync(join(RESULTS_DIR, `${id}.md`))) continue;
    out.push(id);
  }
  return out;
}

function lastCommits(n = 5) {
  try {
    return execSync(`git log --oneline -${n}`, { cwd: REPO_DIR, encoding: 'utf-8', timeout: 5_000 }).trim().split('\n');
  } catch {
    return [];
  }
}

// === REPORT EMAIL post-task ===
// Manda una email di riepilogo a ac2clima@gmail.com via Cloud Function
// nexoSendReport (Gmail SMTP). Best-effort: errori vengono loggati senza
// bloccare il loop MAESTRO.
const REPORT_URL = 'https://europe-west1-nexo-hub-15f2d.cloudfunctions.net/nexoSendReport';
const REPORT_TO = 'ac2clima@gmail.com';
const FORGE_KEY = process.env.FORGE_KEY || 'nexo-forge-2026';

async function sendForgeReport(taskName, result, details) {
  const subject = `NEXO FORGE: ${taskName} ${result}`;
  const body = [
    `Task: ${taskName}`,
    `Risultato: ${result}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    'Dettagli:',
    String(details || '').slice(0, 8000),
  ].join('\n');
  try {
    const resp = await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: REPORT_TO, subject, body, forgeKey: FORGE_KEY }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.error(`[FORGE-MAIL] HTTP ${resp.status}`);
      return false;
    }
    const data = await resp.json().catch(() => ({}));
    if (data.sent === false) {
      console.log(`[FORGE-MAIL] log only (${data.reason || 'no_creds'}) per ${taskName}`);
    } else {
      console.log(`[FORGE-MAIL] inviata per ${taskName}`);
    }
    return true;
  } catch (e) {
    console.error(`[FORGE-MAIL] errore: ${e.message}`);
    return false;
  }
}

function formatStatusMd(codeStatus, pending, commits) {
  const isErr = codeStatus && codeStatus.error;
  const lines = [
    '# NEXO Code Status',
    `Ultimo aggiornamento: ${new Date().toISOString()}`,
    '',
    '## Stato MAESTRO + Claude Code',
  ];
  if (isErr) {
    lines.push(`Errore lettura codeStatus: ${codeStatus.detail}`);
  } else {
    lines.push(
      `Fase: ${codeStatus.fase || 'unknown'}`,
      `Task: ${codeStatus.task || 'nessuno'}`,
      `Dettagli: ${codeStatus.dettagli || codeStatus.msg || ''}`,
      `Uptime: ${codeStatus.uptime != null ? Math.round(codeStatus.uptime) + 's' : 'n/a'}`,
      `Timestamp Firestore: ${codeStatus.timestamp || 'n/a'}`,
      '',
      '<details><summary>Payload JSON</summary>',
      '',
      '```json',
      JSON.stringify(codeStatus, null, 2),
      '```',
      '',
      '</details>',
    );
  }
  lines.push(
    '',
    '## Task pending',
  );
  if (pending.length === 0) {
    lines.push('Nessuno.');
  } else {
    for (const id of pending) lines.push(`- ${id}`);
  }
  lines.push(
    '',
    '## Ultimi 5 commit',
  );
  if (commits.length === 0) {
    lines.push('(nessun commit leggibile)');
  } else {
    for (const c of commits) lines.push(`- ${c}`);
  }
  lines.push('');
  return lines.join('\n');
}

// === DEV REQUEST POLL (Firestore → tasks/dev-request-*.md) ===
// NEXUS scrive le richieste dev in nexo_dev_requests con status="pending".
// Qui le materializziamo come file md nel repo: MAESTRO al ciclo successivo
// le intercetta come kind=dev-request e Claude Code le esegue end-to-end
// (autonomo, decisione 2026-04-28): analizza, fixa, deploya, committa,
// risponde. Niente più "solo analisi" obbligatoria.
// Eccezione: per fix rischiosi (schema, sicurezza, prod massive)
// Claude Code può scegliere di scrivere solo l'analisi e fermarsi.
// NB: scripts/dev_request_poller.mjs fa una cosa simile sulla collection
// _queue, è rimasto come fallback ma il path canonico è questo dentro MAESTRO.
async function pollDevRequests() {
  let snap;
  try {
    snap = await getDb().collection('nexo_dev_requests')
      .where('status', '==', 'pending')
      .limit(10)
      .get();
  } catch (e) {
    console.error(`[DEV-POLL] read failed: ${e.message}`);
    return 0;
  }
  if (snap.empty) return 0;

  const created = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const id = doc.id;
    // Sanitizza l'id per renderlo safe come nome file: solo [A-Za-z0-9._-]
    const safeId = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
    const filename = `tasks/dev-request-${safeId}.md`;
    const fullPath = join(REPO_DIR, filename);
    if (existsSync(fullPath)) {
      // File già materializzato: marchialo file_creato e vai avanti
      // Uso lo stato "in_progress" perché è quello che la PWA IRIS conosce
      // (vedi STATUS_LABELS in iris/index.html). Quando Claude Code scrive
      // l'analisi e la pusha, lo status diventa "completed".
      try { await doc.ref.update({ status: 'in_progress', taskFile: filename, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); } catch {}
      continue;
    }
    const ts = data.createdAt && data.createdAt.toDate
      ? data.createdAt.toDate().toISOString()
      : new Date().toISOString();
    const isBugFromChat = data.type === 'bug_from_chat' && Array.isArray(data.conversation);
    const richiesta = String(
      data.description || data.request || data.message || JSON.stringify(data)
    ).slice(0, 4000);
    const lines = [
      '# Dev Request da NEXUS',
      `Data: ${ts}`,
      `ID Firestore: ${id}`,
      `User: ${data.userId || '(n/a)'}`,
      `Session: ${data.sessionId || '(n/a)'}`,
      `Type: ${data.type || 'generic'}`,
      '',
    ];
    if (isBugFromChat) {
      const note = (data.note || '').trim();
      lines.push('## Nota di Alberto');
      lines.push('');
      if (note) {
        lines.push('> ' + note.replace(/\n/g, '\n> '));
      } else {
        lines.push('> _(nessuna nota — vedi conversazione qui sotto)_');
      }
      lines.push('');
      lines.push('## Conversazione NEXUS (ultimi messaggi)');
      lines.push('');
      const convo = (data.conversation || []).slice(0, 20);
      for (const m of convo) {
        const role = m && m.role === 'assistant' ? 'NEXUS' : 'ALBERTO';
        const collega = m && m.collega ? ` · collega:${m.collega}` : '';
        const stato = m && m.stato ? ` · stato:${m.stato}` : '';
        const when  = m && m.timestamp ? ` · ${m.timestamp}` : '';
        const body  = String(m && m.content || '').slice(0, 2000);
        lines.push(`### ${role}${collega}${stato}${when}`);
        lines.push('');
        lines.push('> ' + body.replace(/\n/g, '\n> '));
        lines.push('');
      }
    } else {
      lines.push('Richiesta:');
      lines.push('');
      lines.push('> ' + richiesta.replace(/\n/g, '\n> '));
      lines.push('');
    }
    lines.push('## Cosa fare (Claude Code) — MODALITÀ AUTONOMA');
    lines.push('');
    lines.push('Decisione 2026-04-28: per le dev-request `bug_from_chat` e `generic`,');
    lines.push('Claude Code **analizza, fixa, deploya, testa, committa, risponde** end-to-end');
    lines.push('senza chiedere conferma. Niente più "solo analisi".');
    lines.push('');
    lines.push('Flusso normale:');
    lines.push('');
    lines.push('1. Analizza il bug (file:riga, root cause)');
    lines.push('2. Implementa il fix subito (regex, handler, prompt, ecc.)');
    lines.push(`3. Scrivi (opzionale) tasks/dev-analysis-${safeId}.md — solo se utile per memoria`);
    lines.push('4. Deploya Cloud Functions / hosting modificato');
    lines.push(`5. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-${safeId}")`);
    lines.push('6. Commit + push (commit semantico --allow-empty se i file sono già autocommit)');
    lines.push(`7. Email report ad ac2clima@gmail.com via nexoSendReport con messaggio "${safeId}: [esito]"`);
    if (isBugFromChat) {
      const sid = String(data.sessionId || '').replace(/['"]/g, '');
      lines.push(`8. Scrivi nella chat NEXUS della sessione \`${sid}\`:`);
      lines.push('   "Fix applicato: [cosa è cambiato]. Riprova."');
      lines.push('   (collection nexus_chat, role=assistant, content=...)');
    }
    lines.push('');
    lines.push('**Eccezione: SOLO ANALISI** (NIENTE implementazione) se il fix è rischioso:');
    lines.push('- Modifica schema database o migrazione collection Firestore');
    lines.push('- Cancellazione/archiviazione massiva dati produzione');
    lines.push('- Rilascio email/WhatsApp non DRY_RUN a clienti reali');
    lines.push('- Cambio architetturale invasivo (es. sostituzione layer completo)');
    lines.push('- Modifica di sicurezza (rules, IAM, secret manager)');
    lines.push('');
    lines.push('In quei casi: scrivi solo `tasks/dev-analysis-' + safeId + '.md` con 2-3 alternative e fermati.');
    lines.push('');
    const contenuto = lines.join('\n');
    try {
      writeFileSync(fullPath, contenuto, 'utf-8');
      created.push(filename);
      // Uso lo stato "in_progress" perché è quello che la PWA IRIS conosce
      // (vedi STATUS_LABELS in iris/index.html). Quando Claude Code scrive
      // l'analisi e la pusha, lo status diventa "completed".
      try { await doc.ref.update({ status: 'in_progress', taskFile: filename, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); } catch {}
      console.log(`[DEV-POLL] creato ${filename} (id=${id})`);
    } catch (e) {
      console.error(`[DEV-POLL] write fallito per ${id}: ${e.message}`);
    }
  }

  if (created.length === 0) return 0;

  // Commit + push
  try {
    execSync('git add tasks/', { cwd: REPO_DIR, stdio: 'pipe', timeout: 5_000 });
    execSync(`git commit -m "dev-request da NEXUS (${created.length})"`, { cwd: REPO_DIR, stdio: 'pipe', timeout: 10_000 });
    gitPullSafe();
    execSync('git push origin main', { cwd: REPO_DIR, stdio: 'pipe', timeout: 15_000 });
    console.log(`[DEV-POLL] pushed ${created.length} file`);
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().slice(0, 200);
    if (!msg.includes('nothing to commit')) console.error(`[DEV-POLL PUSH ERROR] ${msg}`);
  }
  return created.length;
}

function writeAndPushStatusReport() {
  try {
    const codeStatus = fetchCodeStatus();
    const pending = listPendingTasksForReport();
    const commits = lastCommits(5);
    writeFileSync(STATUS_FILE, formatStatusMd(codeStatus, pending, commits), 'utf-8');
  } catch (e) {
    console.error(`[STATUS FILE ERROR] ${e.message}`);
    return;
  }
  // Commit mirato a STATUS.md (non trascina result/task pendenti).
  try {
    execSync('git add STATUS.md', { cwd: REPO_DIR, stdio: 'pipe', timeout: 5_000 });
    execSync('git commit STATUS.md -m "status update"', { cwd: REPO_DIR, stdio: 'pipe', timeout: 10_000 });
    gitPullSafe();
    execSync('git push origin main', { cwd: REPO_DIR, stdio: 'pipe', timeout: 15_000 });
    console.log('[STATUS] STATUS.md aggiornato e pushato');
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString().slice(0, 200);
    if (!msg.includes('nothing to commit')) {
      console.error(`[STATUS PUSH ERROR] ${msg}`);
    }
  }
}

// === GIT HELPERS ===
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_DIR, encoding: 'utf-8', timeout: 30_000 }).trim();
}

// gitPullSafe: pull --rebase resistente a "unstaged changes" e residui di
// rebase precedenti. Pattern:
//   1. abort di un eventuale rebase in corso (residuo di crash precedente)
//   2. add -A + commit "auto: pre-pull" (allow-empty per non fallire)
//   3. pull --rebase --autostash origin main
//   4. fallback: stash -u && pull && stash pop
//   5. ultimo fallback: stampa errore, non blocca il loop
function gitPullSafe() {
  const opts = { cwd: REPO_DIR, stdio: 'pipe', timeout: 30_000 };
  // 1. abort rebase residuo (no-op se non c'è)
  try { execSync('git rebase --abort', opts); } catch {}
  // 2. commit "pre-pull" di tutto ciò che è dirty
  try {
    execSync('git add -A', opts);
    try {
      execSync('git -c commit.gpgsign=false commit -m "auto: pre-pull commit" --allow-empty-message --allow-empty', opts);
    } catch {} // niente da committare → ok
    // 3. pull con autostash come ulteriore safety net
    execSync('git pull --rebase --autostash origin main', opts);
    return true;
  } catch (e1) {
    // 4. fallback stash manuale
    try {
      execSync('git stash -u', opts);
      execSync('git pull --rebase origin main', opts);
      try { execSync('git stash pop', opts); } catch {}
      return true;
    } catch (e2) {
      const msg = String(e2 && e2.message || e2).slice(0, 200);
      console.error(`[PULL SAFE ERROR] ${msg}`);
      // 5. ultimo tentativo: rebase abort + reset, no perdita perché abbiamo committato in step 2
      try { execSync('git rebase --abort', opts); } catch {}
      return false;
    }
  }
}

async function pull() {
  await updateStatus('polling', { msg: 'git pull in corso' });
  // gitPullSafe gestisce dirty tree, rebase residui, autostash; ritorna
  // solo true/false (no stdout). Per capire se ci sono novità confronto
  // l'HEAD prima/dopo.
  let beforeHead = "";
  try { beforeHead = git('rev-parse HEAD'); } catch {}
  const ok = gitPullSafe();
  if (!ok) return false;
  let afterHead = "";
  try { afterHead = git('rev-parse HEAD'); } catch {}
  if (beforeHead && afterHead && beforeHead !== afterHead) {
    console.log(`[PULL] Nuovi aggiornamenti ricevuti`);
    return true;
  }
  return false;
}

function pushFile(message) {
  git('add -A');
  try {
    git(`commit -m "${message}"`);
    gitPullSafe();
    git('push origin main');
    console.log(`[PUSH] ${message}`);
  } catch (e) {
    if (!e.message.includes('nothing to commit')) {
      console.error(`[PUSH ERROR] ${e.message}`);
    }
  }
}

// === TMUX HELPERS ===
function tmuxSessionExists() {
  try {
    execSync(`tmux has-session -t ${TMUX_SESSION} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

function sendToTmux(text) {
  const escaped = text.replace(/'/g, "'\\''");
  // Manda testo literal, pausa, poi C-m separato
  execSync(`tmux send-keys -t ${TMUX_SESSION} -l '${escaped}'`);
  execSync('sleep 1');
  execSync(`tmux send-keys -t ${TMUX_SESSION} C-m`);
}

function getTmuxPane() {
  try {
    return execSync(`tmux capture-pane -t ${TMUX_SESSION} -p`, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function isClaudeAtPrompt() {
  const pane = getTmuxPane();
  // Cerca ❯ nelle ultime 10 righe del pannello
  const lines = pane.trim().split('\n');
  const lastLines = lines.slice(-10);
  return lastLines.some(line => line.includes('❯'));
}

async function waitForPrompt() {
  console.log(`[WAIT] Attendo che Claude Code sia al prompt...`);
  const start = Date.now();
  
  while (Date.now() - start < PROMPT_TIMEOUT) {
    if (isClaudeAtPrompt()) {
      console.log(`[READY] Claude Code è al prompt`);
      return true;
    }
    await new Promise(r => setTimeout(r, 2_000));
  }
  
  console.log(`[TIMEOUT] Claude Code non è tornato al prompt`);
  return false;
}

async function waitForCompletion() {
  console.log(`[ATTESA] Claude Code sta lavorando...`);
  const start = Date.now();
  
  // Aspetta che Claude Code inizi (non sia più al prompt vuoto)
  await new Promise(r => setTimeout(r, 5_000));
  
  let stableCount = 0;
  let lastPane = '';
  
  while (Date.now() - start < RESULT_TIMEOUT) {
    const currentPane = getTmuxPane();
    
    // Se il pannello non cambia E contiene il prompt, Claude ha finito
    if (currentPane === lastPane && isClaudeAtPrompt()) {
      stableCount++;
      if (stableCount >= 3) {
        console.log(`[COMPLETATO] Claude Code ha finito`);
        return true;
      }
    } else {
      stableCount = 0;
    }
    
    lastPane = currentPane;
    await new Promise(r => setTimeout(r, 2_000));
  }
  
  console.log(`[TIMEOUT] Claude Code non ha finito in tempo`);
  return false;
}

// === TASK PROCESSING ===
// Due tipi di task in tasks/:
//   1. dev-request-*.md → richieste NEXUS in modalità AUTONOMA (2026-04-28).
//      MAESTRO le manda a Claude Code con prompt di "analizza + fixa".
//      Claude Code: diagnostica, implementa, deploya, testa, committa,
//      risponde nella chat NEXUS, manda email. Per fix rischiosi può
//      ancora scegliere di scrivere solo `tasks/dev-analysis-{id}.md`.
//      Il task è "fatto" quando Claude Code completa il prompt;
//      MAESTRO crea uno stub dev-analysis vuoto se non ce n'è uno reale,
//      così la coda non riproproduce il task ad ogni ciclo.
//   2. tutti gli altri .md → task di esecuzione standard.
//      Claude Code esegue, MAESTRO scrive results/{taskId}.md.
function getPendingTasks() {
  if (!existsSync(TASKS_DIR)) return [];
  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.md'));

  const pending = [];
  for (const f of files) {
    const id = f.replace('.md', '');
    if (id.startsWith('dev-analysis-')) continue; // output di Claude Code, non task
    if (id.startsWith('dev-request-')) {
      // Richiesta analizzata? Se esiste tasks/dev-analysis-<DEV-ID>.md → fatta.
      const devId = id.replace(/^dev-request-/, '');
      const analysisPath = join(TASKS_DIR, `dev-analysis-${devId}.md`);
      if (existsSync(analysisPath)) continue;
      pending.push({ id, kind: 'dev-request', devId });
      continue;
    }
    if (existsSync(join(RESULTS_DIR, `${id}.md`))) continue;
    pending.push({ id, kind: 'task' });
  }
  return pending;
}

function buildDevRequestPrompt(taskId, devId, originalContent) {
  return [
    `Hai ricevuto una dev request da NEXUS (utente Alberto). MODALITÀ AUTONOMA.`,
    `Analizza, implementa, testa, deploya, committa, rispondi. Niente conferme.`,
    ``,
    `Flusso normale:`,
    `1. Leggi tasks/${taskId}.md`,
    `2. Studia il codice coinvolto (handlers/, projects/nexo-pwa/, scripts/, ecc.)`,
    `3. Diagnostica il bug: file:riga, root cause`,
    `4. Implementa il fix subito (regex, handler, prompt, UI, ...)`,
    `5. (Opzionale) Scrivi tasks/dev-analysis-${devId}.md se utile come memoria`,
    `6. Deploya Cloud Functions / hosting modificato`,
    `7. Testa con nexusTestInternal sui pattern del bug (sessionId="forge-test-${devId}")`,
    `8. Commit + push (commit semantico --allow-empty se autocommit ha già preso i file)`,
    `9. Email report ad ac2clima@gmail.com via nexoSendReport`,
    `10. Se bug_from_chat: scrivi nella chat NEXUS della sessione "Fix applicato: [cosa]. Riprova."`,
    ``,
    `**Eccezione SOLO ANALISI** (no implementazione) se il fix è rischioso:`,
    `- Modifica schema database o migrazione collection Firestore`,
    `- Cancellazione/archiviazione massiva dati produzione`,
    `- Email/WhatsApp non DRY_RUN a clienti reali`,
    `- Cambio architetturale invasivo`,
    `- Modifica di sicurezza (rules, IAM, secret manager)`,
    ``,
    `In quei casi: scrivi solo tasks/dev-analysis-${devId}.md con 2-3 alternative`,
    `e fermati. L'utente sceglierà.`,
    ``,
    `Vedi CLAUDE.md sezione "Dev Requests — Claude Code AUTONOMO" per dettagli.`,
    ``,
    `--- contenuto richiesta ---`,
    originalContent,
  ].join('\n');
}

async function processTask(task) {
  const { id: taskId, kind, devId } = task;
  const taskFile = join(TASKS_DIR, `${taskId}.md`);
  const originalContent = readFileSync(taskFile, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${kind === 'dev-request' ? 'DEV-REQ' : 'TASK'}] ${taskId}`);
  console.log('='.repeat(60));

  await updateStatus('found_task', { task: taskId, msg: kind === 'dev-request' ? 'dev request trovata' : 'task trovato' });

  const ready = await waitForPrompt();
  if (!ready) {
    console.log(`[SKIP] Claude Code non è al prompt, riprovo al prossimo ciclo`);
    return;
  }

  const promptText = kind === 'dev-request'
    ? buildDevRequestPrompt(taskId, devId, originalContent)
    : originalContent;

  console.log(`[INVIO] Mando a Claude Code via tmux...`);
  await updateStatus('sending_to_code', { task: taskId, msg: 'invio a Claude Code' });
  sendToTmux(promptText);

  await updateStatus('waiting_result', { task: taskId, msg: 'Claude Code sta lavorando' });
  const completed = await waitForCompletion();

  if (kind === 'dev-request') {
    // Modalità AUTONOMA (decisione 2026-04-28): Claude Code può scegliere
    // tra fix completo (analizza + implementa + deploya + committa) oppure
    // solo analisi (per bug rischiosi). In entrambi i casi, completed=true
    // significa che ha terminato — la coda libera il task.
    //
    // Il file dev-analysis-{devId}.md resta OPZIONALE: c'è solo se Claude
    // Code ha scelto la via "solo analisi". Se ha implementato direttamente,
    // il fix è in commit/result/email — non in un file dev-analysis.
    await updateStatus('pushing_result', { task: taskId, msg: 'pull risultato da Claude Code' });
    gitPullSafe();
    const analysisPath = join(TASKS_DIR, `dev-analysis-${devId}.md`);
    const hasAnalysis = existsSync(analysisPath);
    const ok = completed; // autonomo: completed → done, niente vincolo file analysis
    console.log(`[DONE] Dev request ${taskId} → completed=${completed} | analisi ${hasAnalysis ? 'presente' : 'non scritta (fix diretto)'}`);
    if (ok) {
      try {
        await getDb().collection('nexo_dev_requests').doc(devId).set({
          status: 'completed',
          analysisFile: hasAnalysis ? `tasks/dev-analysis-${devId}.md` : null,
          autonomousFix: !hasAnalysis,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (e) {
        console.error(`[DEV-REQ STATUS] update completed fallito per ${devId}: ${e.message}`);
      }
      // Se la dev-request era bug_from_chat e c'è un analysis md scritto,
      // pubblica la sintesi nella sessione NEXUS originale. Per i fix
      // autonomi (no analysis), Claude Code scrive direttamente il
      // messaggio "Fix applicato: ..." nella chat (vedi prompt step 10).
      if (hasAnalysis) {
        postForgeAnalysisToChat(devId).catch(e => console.error(`[FORGE→NEXUS] ${e.message}`));
      }
    }
    // Marker: task md spostato/marcato completato così la coda non lo
    // ripropone. Modalità autonoma: completed=true basta per liberare.
    if (ok && !hasAnalysis) {
      // Crea un marker dev-analysis stub minimale per non far ricadere il
      // task in coda al prossimo poll (la queue lo skippa se l'analysis
      // esiste — vedi `getPendingTasks` riga 530-531).
      try {
        const stub = `# Dev Request ${devId} — fix autonomo\n\nClaude Code ha implementato il fix end-to-end senza scrivere un'analisi separata.\nVedi commit recenti per i dettagli del fix.\nCompleted: ${new Date().toISOString()}\n`;
        writeFileSync(analysisPath, stub, 'utf-8');
        try {
          execSync(`git add ${analysisPath}`, { cwd: REPO_DIR, stdio: 'pipe', timeout: 5_000 });
          execSync(`git commit -m "analysis-stub: ${devId} (autonomous fix)"`, { cwd: REPO_DIR, stdio: 'pipe', timeout: 10_000 });
          gitPullSafe();
          execSync('git push origin main', { cwd: REPO_DIR, stdio: 'pipe', timeout: 15_000 });
        } catch {}
      } catch {}
    }
    // Report email non bloccante
    sendForgeReport(taskId, ok ? 'PASS' : 'FAIL (timeout o aborted)',
      `Dev request: ${taskId}\nDevId: ${devId}\nCompletato: ${completed}\nAnalisi: ${hasAnalysis ? 'scritta' : 'fix autonomo (no analysis md)'}`)
      .catch(() => {});
    return;
  }

  const resultContent = [
    `# Risultato: ${taskId}`,
    `> Eseguito: ${new Date().toISOString()}`,
    `> Completato: ${completed ? 'sì' : 'timeout'}`,
  ].join('\n');

  writeFileSync(join(RESULTS_DIR, `${taskId}.md`), resultContent, 'utf-8');
  await updateStatus('pushing_result', { task: taskId, msg: 'push risultato' });
  pushFile(`result: ${taskId}`);
  console.log(`[DONE] Task ${taskId} ${completed ? 'completato' : 'timeout'}`);

  // Se il task cita un dev-analysis-{id} e il dev-request originale era
  // bug_from_chat, posta "Fix applicato" nella sessione NEXUS.
  postForgeFixToChat(taskId, originalContent, completed).catch(e => console.error(`[FORGE→NEXUS fix] ${e.message}`));

  // Report email post-task (best-effort, non blocca il loop).
  sendForgeReport(taskId, completed ? 'PASS' : 'TIMEOUT',
    `Task: ${taskId}\nCompletato: ${completed ? 'sì' : 'timeout'}\nUltimi commit:\n${lastCommits(5).join('\n')}`)
    .catch(() => {});
}

// === FORGE → NEXUS CHAT ============================================
// Quando Claude Code analizza/fixa una dev-request creata dal bottone 🐛
// (type="bug_from_chat"), MAESTRO scrive un messaggio nella stessa
// sessione NEXUS chat dell'utente in modo che Alberto veda il follow-up
// senza dover guardare GitHub. I messaggi forge hanno source="forge"
// così la PWA può stilarli diversamente.

// Pulisce un blocco markdown da elementi tipografici (numerazione, bullet,
// bold, backtick, headers, blockquote, link markdown). Mantiene il testo
// di prosa.
function cleanProseBlock(s) {
  return String(s || '')
    .replace(/^#{1,6}\s+[^\n]+\n?/gm, '')   // rimuovi heading
    .replace(/^\s*\d+\)\s+/gm, '')           // "1) "
    .replace(/^\s*\d+\.\s+/gm, '')           // "1. "
    .replace(/^\s*[-•·]\s+/gm, '')           // bullet
    .replace(/^\s*>\s?/gm, '')               // blockquote prefix
    .replace(/`([^`]+)`/g, '$1')             // backtick
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link markdown → testo
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Prende le prime N frasi di prosa "vere". Salta quelle che terminano con
// ":" (sono introduzioni di liste) o sono troppo brevi.
// Fallback: se non trova frasi prosa qualificate, prende comunque le prime
// N righe non vuote concatenate.
function firstSentencesOfProse(text, n, maxLen) {
  if (!text) return null;
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const sentences = [];
  for (const ln of lines) {
    const parts = ln.split(/(?<=[.!?])\s+/);
    for (const p of parts) {
      const t = p.trim();
      if (!t || t.length < 10) continue;
      if (/:\s*$/.test(t)) continue;
      sentences.push(t);
      if (sentences.length >= n) break;
    }
    if (sentences.length >= n) break;
  }
  let out = sentences.slice(0, n).join(' ');
  // Fallback: nessuna prosa qualificata → usa direttamente le prime righe
  if (!out) {
    out = lines.slice(0, n + 2).join(' ').trim();
  }
  if (!out) return null;
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}

// Estrae sintesi della sezione "Diagnosi" (o fallback al primo blocco prosa).
function extractAnalysisSummary(md) {
  if (!md) return null;
  const txt = String(md);
  const diagM = txt.match(/^##\s+Diagnosi[^\n]*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/m);
  let body = diagM ? diagM[1] : null;
  if (!body) {
    const lines = txt.split('\n');
    let buf = [];
    let started = false;
    for (const l of lines) {
      if (/^#/.test(l)) { if (started) break; continue; }
      if (/^>/.test(l)) continue;
      if (/^\s*$/.test(l)) { if (started && buf.length) break; continue; }
      buf.push(l); started = true;
      if (buf.length >= 8) break;
    }
    body = buf.join('\n');
  }
  if (!body) return null;
  return firstSentencesOfProse(cleanProseBlock(body), 2, 350);
}

// Estrae sintesi della sezione "## Proposta" — primo step in prosa
// (saltando il titolo "### 1) ...").
function extractAnalysisProposal(md) {
  if (!md) return null;
  const txt = String(md);
  const propM = txt.match(/^##\s+Proposta[^\n]*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/m);
  if (!propM) return null;
  const body = propM[1];
  // Cerca contenuto del primo step numerato (escludendo il titolo)
  const stepM = body.match(/^###?\s*\d+\)\s*[^\n]+\n+([\s\S]*?)(?=\n###?\s|\n##\s|$)/m);
  const raw = stepM ? stepM[1] : body;
  return firstSentencesOfProse(cleanProseBlock(raw), 2, 240);
}

// Scrive un messaggio "forge" nella sessione NEXUS dell'utente.
async function writeForgeMessageToNexus(sessionId, content, extra = {}) {
  if (!sessionId || !content) return null;
  try {
    const db = getDb();
    const msgRef = db.collection('nexus_chat').doc();
    await msgRef.set({
      id: msgRef.id,
      sessionId,
      role: 'assistant',
      content: String(content).slice(0, 1800),
      source: 'forge',
      stato: extra.stato || 'completata',
      collegaCoinvolto: 'forge',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...(extra.meta || {}),
    });
    // Aggiorna sessione
    try {
      await db.collection('nexus_sessions').doc(sessionId).update({
        messageCount: admin.firestore.FieldValue.increment(1),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {}
    console.log(`[FORGE→NEXUS] msg ${msgRef.id} scritto in sessione ${sessionId}`);
    return msgRef.id;
  } catch (e) {
    console.error(`[FORGE→NEXUS ERROR] ${e.message}`);
    return null;
  }
}

// Step 1: dopo che Claude Code ha scritto dev-analysis-{devId}.md,
// se il dev-request originale era bug_from_chat, posta un messaggio
// "Ho analizzato il problema: …" nella sessione NEXUS dell'utente.
async function postForgeAnalysisToChat(devId) {
  try {
    const db = getDb();
    const docRef = db.collection('nexo_dev_requests').doc(devId);
    const snap = await docRef.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.type !== 'bug_from_chat') return;
    if (!data.sessionId) return;
    if (data.forgeAnalysisMessageId) {
      console.log(`[FORGE→NEXUS] devId ${devId} già notificato (msg=${data.forgeAnalysisMessageId})`);
      return;
    }

    const path = join(TASKS_DIR, `dev-analysis-${devId}.md`);
    if (!existsSync(path)) return;
    const md = readFileSync(path, 'utf-8');
    const summary = extractAnalysisSummary(md) || 'Ho letto il caso e capito cosa è andato storto.';
    const proposal = extractAnalysisProposal(md);

    const content = proposal
      ? `Ho analizzato il problema: ${summary}\n\nProposta: ${proposal}\n\nLo sto fixando.`
      : `Ho analizzato il problema: ${summary}\n\nLo sto preparando da fixare.`;

    const msgId = await writeForgeMessageToNexus(data.sessionId, content, {
      stato: 'completata',
      meta: { forgeKind: 'analysis', devRequestId: devId },
    });
    if (msgId) {
      try { await docRef.set({ forgeAnalysisMessageId: msgId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch {}
    }
  } catch (e) {
    console.error(`[FORGE→NEXUS analysis] ${e.message}`);
  }
}

// Step 2: dopo un task di implementazione completato, cerca se cita
// dev-analysis-{devId} nel suo contenuto. Se sì e il dev-request è
// bug_from_chat, posta un messaggio "Fix applicato. …" nella sessione.
async function postForgeFixToChat(taskId, taskContent, completed) {
  try {
    const m = String(taskContent || '').match(/dev-analysis-([A-Za-z0-9_-]{10,})/);
    if (!m) return;
    const devId = m[1];
    const db = getDb();
    const docRef = db.collection('nexo_dev_requests').doc(devId);
    const snap = await docRef.get();
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.type !== 'bug_from_chat') return;
    if (!data.sessionId) return;
    if (data.forgeFixMessageId) {
      console.log(`[FORGE→NEXUS] fix devId ${devId} già notificato`);
      return;
    }

    // Estrai sintesi del fix dal task originale (prime 1-2 frasi sostanziose)
    const taskHead = String(taskContent || '').split('\n').slice(0, 12).join('\n');
    let descr = (taskHead.match(/^[^#>\n][^\n]+/m) || [''])[0].trim();
    if (descr.length > 220) descr = descr.slice(0, 210).replace(/\s+\S*$/, '') + '…';

    const content = completed
      ? `Fix applicato e deployato. ${descr || 'Le modifiche sono live in produzione.'} Riprova quando vuoi.`
      : `Ho lavorato al fix per ${devId} ma il task non è andato a buon fine (timeout). Lo riproveremo.`;

    const msgId = await writeForgeMessageToNexus(data.sessionId, content, {
      stato: completed ? 'completata' : 'errore',
      meta: { forgeKind: 'fix', devRequestId: devId, taskId },
    });
    if (msgId) {
      try { await docRef.set({ forgeFixMessageId: msgId, fixedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch {}
    }
  } catch (e) {
    console.error(`[FORGE→NEXUS fix] ${e.message}`);
  }
}

// === CLAUDE-CODE REQUESTS (chat NEXUS bottone 🧠) ===
//
// Flusso:
//   1. Utente clicca 🧠 in PWA NEXUS → Cloud Function nexusRouter scrive
//      in nexo_claude_requests con status="pending".
//   2. MAESTRO (questo poller) prende la richiesta più vecchia pending,
//      manda il prompt a Claude Code via tmux, aspetta che scriva la
//      risposta in tasks/claude-response-{reqId}.md.
//   3. MAESTRO legge il file, scrive il content in nexus_chat con
//      source="claude_code", marca la richiesta completed.
//   4. Timeout: se Claude Code non risponde entro CLAUDE_REQUEST_TIMEOUT,
//      scrive un messaggio di timeout nella chat e marca status=timeout.

const CLAUDE_REQ_TIMEOUT = 300_000; // 5 minuti
const CLAUDE_REQ_COLLECTION = 'nexo_claude_requests';

function buildClaudeRequestPrompt(reqId, userMessage, conversation, sessionId) {
  const convoLines = [];
  if (Array.isArray(conversation) && conversation.length) {
    convoLines.push('## Contesto conversazione (ultimi turni della sessione)');
    convoLines.push('');
    for (const m of conversation) {
      const role = m && m.role === 'assistant' ? 'NEXUS' : 'ALBERTO';
      const body = String(m && m.content || '').slice(0, 1500);
      convoLines.push(`### ${role}`);
      convoLines.push('');
      convoLines.push('> ' + body.replace(/\n/g, '\n> '));
      convoLines.push('');
    }
  }
  return [
    `Sei NEXUS, l'assistente AI di Alberto Contardi (ACG Clima Service S.R.L., manutenzione HVAC, Piemonte).`,
    `Alberto ti ha chiesto qualcosa dalla chat NEXUS (bottone 🧠 Claude — analisi profonda, non routing veloce).`,
    `NON fare analisi del codice, NON modificare file di produzione. Rispondi alla domanda di Alberto come un collega esperto, in italiano naturale, conciso (5-15 frasi tipiche).`,
    `Se serve, puoi cercare dati in Firestore (progetti: nexo-hub-15f2d, garbymobile-f89ac, guazzotti-tec) — ma solo letture, niente scritture.`,
    ``,
    `## Domanda di Alberto`,
    ``,
    '> ' + String(userMessage).slice(0, 4000).replace(/\n/g, '\n> '),
    ``,
    ...convoLines,
    `## Cosa devi fare (importante)`,
    ``,
    `1. Pensa alla risposta e scrivila in un file: \`tasks/claude-response-${reqId}.md\``,
    `2. Il contenuto del file = SOLO il testo della risposta (italiano, naturale, niente markdown elaborato, niente sezioni "## Risposta", solo le frasi che diresti ad Alberto).`,
    `3. Massimo 1500 caratteri per restare leggibile in chat.`,
    `4. Niente git commit/push (MAESTRO se ne occupa).`,
    `5. Quando hai finito di scrivere il file, **fermati e torna al prompt** — non fare altro.`,
    ``,
    `Session: ${sessionId}`,
    `Request ID: ${reqId}`,
  ].join('\n');
}

async function pollClaudeRequests() {
  let snap;
  try {
    snap = await getDb().collection(CLAUDE_REQ_COLLECTION)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(5)
      .get();
  } catch (e) {
    // Se manca l'indice composito, fallback a query semplice
    if (/index/i.test(e.message || '')) {
      try {
        snap = await getDb().collection(CLAUDE_REQ_COLLECTION)
          .where('status', '==', 'pending')
          .limit(5)
          .get();
      } catch (e2) {
        console.error(`[CLAUDE-POLL] read failed: ${e2.message}`);
        return 0;
      }
    } else {
      console.error(`[CLAUDE-POLL] read failed: ${e.message}`);
      return 0;
    }
  }
  if (snap.empty) return 0;
  // Prendi la più vecchia (gestione manuale se l'orderBy non era applicabile)
  const docs = snap.docs.slice().sort((a, b) => {
    const ta = a.data().createdAt?.toMillis?.() || 0;
    const tb = b.data().createdAt?.toMillis?.() || 0;
    return ta - tb;
  });
  return await processClaudeRequest(docs[0]);
}

async function processClaudeRequest(doc) {
  const reqId = doc.id;
  const data = doc.data() || {};
  const sessionId = data.sessionId;
  const userMessage = data.userMessage || '';
  const conversation = Array.isArray(data.conversation) ? data.conversation : [];
  const userMsgId = data.userMsgId || null;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[CLAUDE-REQ] ${reqId}`);
  console.log('='.repeat(60));
  console.log(`Session: ${sessionId}`);
  console.log(`User msg: ${userMessage.slice(0, 100)}${userMessage.length > 100 ? '...' : ''}`);

  // Marca in_progress
  try {
    await doc.ref.update({
      status: 'in_progress',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error(`[CLAUDE-REQ] update in_progress failed: ${e.message}`);
  }

  // Verifica Claude Code al prompt
  const ready = await waitForPrompt();
  if (!ready) {
    console.log(`[CLAUDE-REQ] Claude Code non al prompt, marco timeout`);
    return await failClaudeRequest(doc, sessionId, 'Claude non disponibile al momento, riprova tra qualche minuto.');
  }

  // Pulisci eventuale file precedente (nel caso di retry)
  const responseFile = join(TASKS_DIR, `claude-response-${reqId}.md`);
  try { execSync(`rm -f ${responseFile}`); } catch {}

  // Manda prompt
  const prompt = buildClaudeRequestPrompt(reqId, userMessage, conversation, sessionId);
  console.log(`[CLAUDE-REQ] Mando prompt a Claude Code (${prompt.length} char)`);
  try {
    sendToTmux(prompt);
  } catch (e) {
    console.error(`[CLAUDE-REQ] sendToTmux failed: ${e.message}`);
    return await failClaudeRequest(doc, sessionId, 'Errore tecnico nell\'invio a Claude. Riprova.');
  }

  // Aspetta che il file di risposta venga creato (polling 3s, max 5min)
  const start = Date.now();
  let responseContent = null;
  while (Date.now() - start < CLAUDE_REQ_TIMEOUT) {
    if (existsSync(responseFile)) {
      try {
        responseContent = readFileSync(responseFile, 'utf-8').trim();
        if (responseContent) break;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!responseContent) {
    console.log(`[CLAUDE-REQ] timeout ${CLAUDE_REQ_TIMEOUT/1000}s senza risposta`);
    return await failClaudeRequest(doc, sessionId,
      `Claude non ha risposto entro ${Math.floor(CLAUDE_REQ_TIMEOUT/60000)} minuti. Riprova oppure usa il bottone ⚡ (Groq).`);
  }

  // Tronca se troppo lungo per Firestore message
  const truncated = responseContent.slice(0, 1800);
  console.log(`[CLAUDE-REQ] risposta letta (${responseContent.length} char), scrivo in nexus_chat`);

  // Scrivi risposta in nexus_chat
  let nexusMessageId = null;
  try {
    const db = getDb();
    const msgRef = db.collection('nexus_chat').doc();
    nexusMessageId = msgRef.id;
    await msgRef.set({
      id: msgRef.id,
      sessionId,
      role: 'assistant',
      content: truncated,
      source: 'claude_code',
      stato: 'completata',
      claudeRequestId: reqId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
      await db.collection('nexus_sessions').doc(sessionId).update({
        messageCount: admin.firestore.FieldValue.increment(1),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {}
  } catch (e) {
    console.error(`[CLAUDE-REQ] write nexus_chat failed: ${e.message}`);
    return await failClaudeRequest(doc, sessionId, 'Errore scrittura risposta. Riprova.');
  }

  // Marca completed
  try {
    await doc.ref.update({
      status: 'completed',
      nexusMessageId,
      responseLength: responseContent.length,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error(`[CLAUDE-REQ] update completed failed: ${e.message}`);
  }

  // Pulisci il file di risposta (commit-safe)
  try { execSync(`rm -f ${responseFile}`); } catch {}

  console.log(`[CLAUDE-REQ] ${reqId} completed → nexus_chat ${nexusMessageId}`);
  return 1;
}

async function failClaudeRequest(doc, sessionId, errorMessage) {
  // Scrivi messaggio di errore in chat
  try {
    const db = getDb();
    const msgRef = db.collection('nexus_chat').doc();
    await msgRef.set({
      id: msgRef.id,
      sessionId,
      role: 'assistant',
      content: errorMessage,
      source: 'claude_code',
      stato: 'claude_timeout',
      claudeRequestId: doc.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error(`[CLAUDE-REQ FAIL] write fail msg failed: ${e.message}`);
  }
  // Marca status=timeout/failed
  try {
    await doc.ref.update({
      status: 'timeout',
      error: errorMessage,
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {}
  return 0;
}

// === MAIN LOOP ===
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   MAESTRO — Ponte Claude Chat ↔ Claude Code     ║');
  console.log('║   Via tmux + GitHub                              ║');
  console.log('╚══════════════════════════════════════════════════╝');

  if (!tmuxSessionExists()) {
    console.error(`\n[ERRORE] Sessione tmux "${TMUX_SESSION}" non trovata!`);
    console.error(`  tmux new-session -d -s ${TMUX_SESSION} 'cd ~/maestro-bridge && claude --permission-mode acceptEdits'`);
    process.exit(1);
  }

  console.log(`Sessione tmux: ${TMUX_SESSION} ✓`);
  console.log(`Repo: ${REPO_DIR}`);
  console.log(`Poll: ogni ${POLL_INTERVAL/1000}s · STATUS.md ogni ${STATUS_REPORT_EVERY * POLL_INTERVAL / 1000}s\n`);

  // Primo poll dev-requests + report subito allo startup (utile per
  // Claude Chat e per recuperare richieste pendenti pre-restart).
  await pollDevRequests();
  await pollClaudeRequests();
  writeAndPushStatusReport();

  let ciclo = 0;
  while (true) {
    await pull();

    // Priorità 1: claude-requests (utente in chat aspetta risposta).
    // Una alla volta — ne processa al massimo 1 per ciclo per non
    // monopolizzare tmux.
    let claudeProcessed = 0;
    try {
      claudeProcessed = await pollClaudeRequests();
    } catch (e) {
      console.error(`[CLAUDE-POLL] errore: ${e.message}`);
    }

    // Priorità 2: tasks/dev-requests SOLO se non c'è una claude-request
    // appena lavorata (così il prossimo ciclo controlla altre claude-requests
    // pendenti prima di partire con dev-requests che possono durare minuti).
    if (claudeProcessed === 0) {
      const pending = getPendingTasks();
      if (pending.length > 0) {
        console.log(`[FOUND] ${pending.length} task in attesa`);
        for (const task of pending) {
          await processTask(task);
        }
      } else {
        await updateStatus('idle', { msg: 'nessun task in coda' });
      }
    }

    ciclo++;
    if (ciclo % STATUS_REPORT_EVERY === 0) {
      await pollDevRequests();
      writeAndPushStatusReport();
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(e => {
  console.error('MAESTRO errore fatale:', e);
  process.exit(1);
});
