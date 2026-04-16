import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// === CONFIG ===
const POLL_INTERVAL = 30_000; // 30 secondi
const REPO_DIR = process.cwd();
const TASKS_DIR = join(REPO_DIR, 'tasks');
const RESULTS_DIR = join(REPO_DIR, 'results');
const CLAUDE_PATH = process.env.CLAUDE_CODE_PATH || 'claude';

// === GIT HELPERS ===
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_DIR, encoding: 'utf-8', timeout: 30_000 }).trim();
}

function pull() {
  try {
    const out = git('pull --rebase origin main');
    if (out.includes('Already up to date')) return false;
    console.log(`[PULL] ${out}`);
    return true;
  } catch (e) {
    console.error(`[PULL ERROR] ${e.message}`);
    return false;
  }
}

function pushResults(taskId, content) {
  const resultFile = join(RESULTS_DIR, `${taskId}.md`);
  writeFileSync(resultFile, content, 'utf-8');
  git('add -A');
  git(`commit -m "result: ${taskId}"`);
  git('push origin main');
  console.log(`[PUSH] Risultato pushato per ${taskId}`);
}

// === CLAUDE CODE ===
function runClaude(prompt, workdir) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits'];
    const proc = spawn(CLAUDE_PATH, args, {
      cwd: workdir || REPO_DIR,
      timeout: 600_000, // 10 minuti max
    });
    
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code === 0) {
        try {
          const json = JSON.parse(stdout);
          resolve(json.result || stdout);
        } catch {
          resolve(stdout);
        }
      } else {
        reject(new Error(`Claude exit ${code}: ${stderr}`));
      }
    });
    proc.on('error', reject);
  });
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
  console.log(`[CONTENUTO] ${content.substring(0, 200)}...`);
  console.log('='.repeat(60));
  
  try {
    const result = await runClaude(content, REPO_DIR);
    
    const resultContent = [
      `# Risultato: ${taskId}`,
      `> Eseguito: ${new Date().toISOString()}`,
      '',
      '## Output',
      '',
      typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    ].join('\n');
    
    pushResults(taskId, resultContent);
    console.log(`[DONE] Task ${taskId} completato`);
  } catch (e) {
    const errorContent = [
      `# Errore: ${taskId}`,
      `> Fallito: ${new Date().toISOString()}`,
      '',
      '## Errore',
      '',
      e.message,
    ].join('\n');
    
    pushResults(taskId, errorContent);
    console.error(`[FAIL] Task ${taskId}: ${e.message}`);
  }
}

// === MAIN LOOP ===
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   MAESTRO — Polling attivo           ║');
  console.log('║   In ascolto su GitHub...            ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Repo: ${REPO_DIR}`);
  console.log(`Claude: ${CLAUDE_PATH}`);
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
