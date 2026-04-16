import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

// === CONFIG ===
const POLL_INTERVAL = 15_000;
const REPO_DIR = process.cwd();
const TASKS_DIR = join(REPO_DIR, 'tasks');
const RESULTS_DIR = join(REPO_DIR, 'results');
const TMUX_SESSION = 'claude-code';
const PROMPT_TIMEOUT = 300_000; // 5 min max attesa prompt
const RESULT_TIMEOUT = 300_000; // 5 min max attesa risultato

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
  execSync(`tmux send-keys -t ${TMUX_SESSION} '${escaped}' C-m`);
}

function getTmuxLastLine() {
  try {
    const output = execSync(`tmux capture-pane -t ${TMUX_SESSION} -p`, { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    // Cerca dal basso verso l'alto la prima riga non vuota
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.length > 0) return line;
    }
    return '';
  } catch {
    return '';
  }
}

async function waitForPrompt() {
  console.log(`[WAIT] Attendo che Claude Code sia al prompt...`);
  const start = Date.now();
  
  while (Date.now() - start < PROMPT_TIMEOUT) {
    const lastLine = getTmuxLastLine();
    
    // Claude Code mostra ❯ quando è pronto per input
    if (lastLine.includes('❯')) {
      console.log(`[READY] Claude Code è al prompt`);
      return true;
    }
    
    await new Promise(r => setTimeout(r, 2_000));
  }
  
  console.log(`[TIMEOUT] Claude Code non è tornato al prompt in ${PROMPT_TIMEOUT/1000}s`);
  return false;
}

async function waitForCompletion() {
  console.log(`[ATTESA] Claude Code sta lavorando...`);
  const start = Date.now();
  
  // Aspetta che Claude Code inizi a lavorare (non sia più al prompt con il testo inviato)
  await new Promise(r => setTimeout(r, 5_000));
  
  let stableCount = 0;
  let lastLine = '';
  
  while (Date.now() - start < RESULT_TIMEOUT) {
    const currentLine = getTmuxLastLine();
    
    if (currentLine.includes('❯') && currentLine === lastLine) {
      stableCount++;
      // Se il prompt è stabile per 6 secondi (3 check), Claude Code ha finito
      if (stableCount >= 3) {
        console.log(`[COMPLETATO] Claude Code ha finito`);
        return true;
      }
    } else {
      stableCount = 0;
    }
    
    lastLine = currentLine;
    await new Promise(r => setTimeout(r, 2_000));
  }
  
  console.log(`[TIMEOUT] Claude Code non ha finito in ${RESULT_TIMEOUT/1000}s`);
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

  // 1. Aspetta che Claude Code sia al prompt
  const ready = await waitForPrompt();
  if (!ready) {
    const errorContent = `# Timeout: ${taskId}\n> Claude Code non era al prompt\n`;
    writeFileSync(join(RESULTS_DIR, `${taskId}.md`), errorContent, 'utf-8');
    pushFile(`timeout: ${taskId}`);
    return;
  }

  // 2. Invia il prompt
  console.log(`[INVIO] Mando a Claude Code via tmux...`);
  sendToTmux(content);

  // 3. Aspetta che Claude Code finisca
  const completed = await waitForCompletion();

  // 4. Cattura output e salva risultato
  const output = execSync(`tmux capture-pane -t ${TMUX_SESSION} -p -S -100`, { encoding: 'utf-8' });
  
  const resultContent = [
    `# Risultato: ${taskId}`,
    `> Eseguito: ${new Date().toISOString()}`,
    `> Completato: ${completed ? 'sì' : 'timeout'}`,
    '',
    '## Output Claude Code',
    '',
    '```',
    output.trim(),
    '```',
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
    console.error(`\nAvvia prima Claude Code in tmux:`);
    console.error(`  tmux new-session -d -s ${TMUX_SESSION} 'claude --permission-mode acceptEdits'`);
    console.error(`\nPoi lancia:`);
    console.error(`  node maestro.mjs`);
    process.exit(1);
  }

  console.log(`Sessione tmux: ${TMUX_SESSION} ✓`);
  console.log(`Repo: ${REPO_DIR}`);
  console.log(`Poll: ogni ${POLL_INTERVAL/1000}s`);
  console.log('');

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
