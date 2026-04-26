import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
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
// le intercetta come kind=dev-request e Claude Code le analizza (no impl).
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
      try { await doc.ref.update({ status: 'file_creato', taskFile: filename, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); } catch {}
      continue;
    }
    const ts = data.createdAt && data.createdAt.toDate
      ? data.createdAt.toDate().toISOString()
      : new Date().toISOString();
    const richiesta = String(
      data.description || data.request || data.message || JSON.stringify(data)
    ).slice(0, 4000);
    const contenuto = [
      '# Dev Request da NEXUS',
      `Data: ${ts}`,
      `ID Firestore: ${id}`,
      `User: ${data.userId || '(n/a)'}`,
      `Session: ${data.sessionId || '(n/a)'}`,
      '',
      'Richiesta:',
      '',
      '> ' + richiesta.replace(/\n/g, '\n> '),
      '',
      '## Cosa fare (Claude Code)',
      '',
      '1. Leggi il codice coinvolto (handler, PWA, scripts).',
      `2. Scrivi analisi in tasks/dev-analysis-${safeId}.md (diagnosi, file/righe, proposta, rischi, effort).`,
      '3. NON implementare. Solo analisi, poi commit e push.',
      '',
    ].join('\n');
    try {
      writeFileSync(fullPath, contenuto, 'utf-8');
      created.push(filename);
      try { await doc.ref.update({ status: 'file_creato', taskFile: filename, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); } catch {}
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
    try { execSync('git pull --rebase origin main', { cwd: REPO_DIR, stdio: 'pipe', timeout: 15_000 }); } catch {}
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
    try { execSync('git pull --rebase origin main', { cwd: REPO_DIR, stdio: 'pipe', timeout: 15_000 }); } catch {}
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

async function pull() {
  await updateStatus('polling', { msg: 'git pull in corso' });
  try {
    const out = git('pull --rebase origin main');
    if (out.includes('Already up to date')) return false;
    console.log(`[PULL] Nuovi aggiornamenti ricevuti`);
    return true;
  } catch (e) {
    console.error(`[PULL ERROR] ${e.message}`);
    return false;
  }
}

function pushFile(message) {
  git('add -A');
  try {
    git(`commit -m "${message}"`);
    try { git('pull --rebase origin main'); } catch {}
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
//   1. dev-request-*.md → richieste NEXUS da analizzare (NON eseguire).
//      MAESTRO le manda a Claude Code con prompt di SOLA ANALISI:
//      Claude Code scrive l'analisi in tasks/dev-analysis-{id}.md e la pusha.
//      Il "result" finale è il file dev-analysis, non un result-*.md normale.
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
    `Hai ricevuto una dev request da NEXUS (utente Alberto). NON IMPLEMENTARE.`,
    `Devi solo analizzare e proporre.`,
    ``,
    `Step:`,
    `1. Leggi il file: tasks/${taskId}.md`,
    `2. Studia il codice coinvolto (handlers/, projects/nexo-pwa/, scripts/, ecc.).`,
    `3. Scrivi la tua analisi in: tasks/dev-analysis-${devId}.md`,
    `   Struttura:`,
    `   - Diagnosi: cosa succede oggi e perché`,
    `   - File coinvolti: percorsi e righe specifiche`,
    `   - Proposta: cosa cambiare, in che ordine, perché`,
    `   - Rischi e alternative`,
    `   - Effort stimato (S/M/L)`,
    `4. Committa e pusha su main: git add tasks/dev-analysis-${devId}.md && git commit -m "analysis: ${devId}" && git push origin main`,
    ``,
    `IMPORTANTE: NON modificare codice di produzione, solo scrivere il file di analisi.`,
    `Quando hai finito, torna al prompt.`,
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
    // L'output è tasks/dev-analysis-{devId}.md, scritto e pushato da Claude Code.
    // MAESTRO non scrive un result-*.md (così il task non sparisce dalla coda
    // finché l'analisi non è pushata davvero). Tenta un pull per vederla.
    await updateStatus('pushing_result', { task: taskId, msg: 'pull analisi da Claude Code' });
    try { git('pull --rebase origin main'); } catch {}
    const analysisPath = join(TASKS_DIR, `dev-analysis-${devId}.md`);
    const ok = existsSync(analysisPath);
    console.log(`[DONE] Dev request ${taskId} → analisi ${ok ? 'presente' : 'NON trovata'} (completed=${completed})`);
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
  writeAndPushStatusReport();

  let ciclo = 0;
  while (true) {
    await pull();

    const pending = getPendingTasks();
    if (pending.length > 0) {
      console.log(`[FOUND] ${pending.length} task in attesa`);
      for (const task of pending) {
        await processTask(task);
      }
    } else {
      await updateStatus('idle', { msg: 'nessun task in coda' });
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
