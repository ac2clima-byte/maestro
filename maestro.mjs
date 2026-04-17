import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

// === CONFIG ===
const POLL_INTERVAL = 15_000;
const REPO_DIR = process.cwd();
const TASKS_DIR = join(REPO_DIR, 'tasks');
const RESULTS_DIR = join(REPO_DIR, 'results');
const TMUX_SESSION = 'claude-code';
const PROMPT_TIMEOUT = 300_000;
const RESULT_TIMEOUT = 300_000;

// === ENSURE DIRS ===
[TASKS_DIR, RESULTS_DIR].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

// === GIT HELPERS ===
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_DIR, encoding: 'utf-8', timeout: 30_000 }).trim();
}

function pull() {
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
function getPendingTasks() {
  if (!existsSync(TASKS_DIR)) return [];
  return readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
    .filter(id => !existsSync(join(RESULTS_DIR, `${id}.md`)));
}

async function processTask(taskId) {
  const taskFile = join(TASKS_DIR, `${taskId}.md`);
  const content = readFileSync(taskFile, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TASK] ${taskId}`);
  console.log('='.repeat(60));

  const ready = await waitForPrompt();
  if (!ready) {
    writeFileSync(join(RESULTS_DIR, `${taskId}.md`), `# Timeout: prompt non disponibile\n`, 'utf-8');
    pushFile(`timeout: ${taskId}`);
    return;
  }

  console.log(`[INVIO] Mando a Claude Code via tmux...`);
  sendToTmux(content);

  const completed = await waitForCompletion();

  const resultContent = [
    `# Risultato: ${taskId}`,
    `> Eseguito: ${new Date().toISOString()}`,
    `> Completato: ${completed ? 'sì' : 'timeout'}`,
  ].join('\n');

  writeFileSync(join(RESULTS_DIR, `${taskId}.md`), resultContent, 'utf-8');
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
  console.log(`Poll: ogni ${POLL_INTERVAL/1000}s\n`);

  while (true) {
    pull();
    
    const pending = getPendingTasks();
    if (pending.length > 0) {
      console.log(`[FOUND] ${pending.length} task in attesa`);
      for (const taskId of pending) {
        await processTask(taskId);
      }
    }
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(e => {
  console.error('MAESTRO errore fatale:', e);
  process.exit(1);
});
