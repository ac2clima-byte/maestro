import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

// === CONFIG ===
const POLL_INTERVAL = 15_000; // 15 secondi
const REPO_DIR = process.cwd();
const TASKS_DIR = join(REPO_DIR, 'tasks');
const RESULTS_DIR = join(REPO_DIR, 'results');
const TMUX_SESSION = 'claude-code';
const RESULT_TIMEOUT = 300_000; // 5 minuti max attesa risultato

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

function pushFile(filePath, message) {
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
  // Escape singoli apici per shell
  const escaped = text.replace(/'/g, "'\\''");
  execSync(`tmux send-keys -t ${TMUX_SESSION} '${escaped}' Enter`);
}

function getTmuxOutput() {
  // Cattura il contenuto visibile del pannello tmux
  return execSync(`tmux capture-pane -t ${TMUX_SESSION} -p -S -50`, { encoding: 'utf-8' });
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
  console.log(`[INVIO A CLAUDE CODE via tmux]`);
  console.log('='.repeat(60));

  // Invia il prompt a Claude Code nella sessione tmux
  sendToTmux(content);

  // Aspetta che Claude Code finisca (polling sul pannello tmux)
  console.log(`[ATTESA] Claude Code sta lavorando...`);
  
  // Aspettiamo che Claude Code torni al prompt (❯ o >)
  const startTime = Date.now();
  let lastOutput = '';
  
  // Aspetta un po' prima di iniziare a controllare
  await new Promise(r => setTimeout(r, 5_000));
  
  while (Date.now() - startTime < RESULT_TIMEOUT) {
    await new Promise(r => setTimeout(r, 3_000));
    
    const currentOutput = getTmuxOutput();
    
    // Se l'output non cambia da 10 secondi e contiene il prompt, Claude ha finito
    if (currentOutput === lastOutput && currentOutput.length > 0) {
      // Cerchiamo indicatori che Claude Code ha finito
      const lines = currentOutput.trim().split('\n');
      const lastLine = lines[lines.length - 1].trim();
      
      // Claude Code mostra ❯ o > quando è in attesa di input
      if (lastLine.includes('❯') || lastLine.match(/^>\s*$/)) {
        console.log(`[COMPLETATO] Claude Code ha finito`);
        
        // Salva il risultato
        const resultContent = [
          `# Risultato: ${taskId}`,
          `> Eseguito: ${new Date().toISOString()}`,
          '',
          '## Output Claude Code',
          '',
          '```',
          currentOutput,
          '```',
        ].join('\n');
        
        writeFileSync(join(RESULTS_DIR, `${taskId}.md`), resultContent, 'utf-8');
        pushFile(join(RESULTS_DIR, `${taskId}.md`), `result: ${taskId}`);
        return;
      }
    }
    
    lastOutput = currentOutput;
  }
  
  // Timeout
  console.log(`[TIMEOUT] Claude Code non ha risposto in ${RESULT_TIMEOUT/1000}s`);
  const timeoutContent = [
    `# Timeout: ${taskId}`,
    `> Timeout: ${new Date().toISOString()}`,
    '',
    '## Ultimo output visibile',
    '',
    '```',
    lastOutput,
    '```',
  ].join('\n');
  
  writeFileSync(join(RESULTS_DIR, `${taskId}.md`), timeoutContent, 'utf-8');
  pushFile(join(RESULTS_DIR, `${taskId}.md`), `timeout: ${taskId}`);
}

// === MAIN LOOP ===
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   MAESTRO — Ponte Claude Chat ↔ Claude Code     ║');
  console.log('║   Via tmux + GitHub                              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  
  // Verifica sessione tmux
  if (!tmuxSessionExists()) {
    console.error(`\n[ERRORE] Sessione tmux "${TMUX_SESSION}" non trovata!`);
    console.error(`\nAvvia prima Claude Code in tmux:`);
    console.error(`  tmux new-session -d -s ${TMUX_SESSION} 'claude'`);
    console.error(`  tmux attach -t ${TMUX_SESSION}`);
    console.error(`\nPoi in un altro terminale lancia:`);
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
