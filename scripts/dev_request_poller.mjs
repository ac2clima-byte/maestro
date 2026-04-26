#!/usr/bin/env node
// dev_request_poller.mjs — Loop locale che legge nexo_dev_requests_queue su
// Firestore (nexo-hub-15f2d), trasforma le richieste in file
// tasks/dev-request-{DEV-NNN}.md, committa e pusha su GitHub. MAESTRO poi
// li intercetta e li manda a Claude Code per l'analisi (NON l'esecuzione).
//
// Avvio: node scripts/dev_request_poller.mjs
// Una iterazione: node scripts/dev_request_poller.mjs --once
//
// Idempotente: se il file esiste già o queueStatus != "pending" salta.

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, '..');
const TASKS_DIR = join(REPO_DIR, 'tasks');
const POLL_INTERVAL = 15_000;
const FIREBASE_PROJECT = 'nexo-hub-15f2d';

if (!existsSync(TASKS_DIR)) mkdirSync(TASKS_DIR, { recursive: true });

if (!admin.apps.length) {
  admin.initializeApp({ projectId: FIREBASE_PROJECT });
}
const db = admin.firestore();

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_DIR, encoding: 'utf-8', timeout: 30_000 }).trim();
}

function formatDevRequestMd(id, description, meta) {
  const ts = meta.createdAt && meta.createdAt.toDate
    ? meta.createdAt.toDate().toISOString()
    : new Date().toISOString();
  return [
    `# Dev Request ${id} — Analisi richiesta (NON ESEGUIRE)`,
    '',
    '> **Istruzione per Claude Code**: NON implementare questa modifica.',
    '> Leggi la richiesta, studia il codice coinvolto, e scrivi la tua analisi e proposta',
    `> in \`tasks/dev-analysis-${id}.md\`. Lascia decidere ad Alberto se procedere.`,
    '',
    `**ID**: \`${id}\``,
    `**Data**: ${ts}`,
    `**User**: ${meta.userId || '(n/a)'}`,
    `**Session**: ${meta.sessionId || '(n/a)'}`,
    `**Source**: nexus_chat`,
    '',
    '## Richiesta originale',
    '',
    '> ' + (description || '').replace(/\n/g, '\n> '),
    '',
    '## Cosa fare',
    '',
    '1. Leggi il codice coinvolto (handler, PWA, scripts).',
    '2. Identifica file e righe interessate.',
    `3. Scrivi analisi e proposta in \`tasks/dev-analysis-${id}.md\` con:`,
    '   - diagnosi (cosa succede oggi)',
    '   - proposta (cosa cambiare e perché)',
    '   - rischi e alternative',
    '   - effort stimato',
    '4. NON modificare il codice di produzione. Solo analisi.',
    '',
  ].join('\n') + '\n';
}

async function processQueueOnce() {
  let snap;
  try {
    snap = await db.collection('nexo_dev_requests_queue')
      .where('queueStatus', '==', 'pending')
      .limit(20)
      .get();
  } catch (e) {
    console.error(`[poller] firestore read failed: ${e.message}`);
    return 0;
  }

  if (snap.empty) return 0;

  const newFiles = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const id = data.id || doc.id;
    const description = data.description || '';
    const fname = `dev-request-${id}.md`;
    const fpath = join(TASKS_DIR, fname);

    if (existsSync(fpath)) {
      console.log(`[poller] ${fname} già esiste, marco pushed`);
      await doc.ref.set({
        queueStatus: 'pushed',
        pushedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    try {
      writeFileSync(fpath, formatDevRequestMd(id, description, data), 'utf-8');
      newFiles.push({ id, fname, ref: doc.ref });
      console.log(`[poller] scritto tasks/${fname}`);
    } catch (e) {
      console.error(`[poller] write failed per ${id}: ${e.message}`);
    }
  }

  if (newFiles.length === 0) return 0;

  // git add + commit + pull --rebase + push
  try {
    git('add tasks/');
    git(`commit -m "feat(dev-requests): nuove richieste da NEXUS (${newFiles.length})"`);
    try { git('pull --rebase origin main'); } catch (e) { console.error(`[poller] rebase warn: ${e.message}`); }
    git('push origin main');
    console.log(`[poller] pushed ${newFiles.length} file`);
  } catch (e) {
    if (!e.message.includes('nothing to commit')) {
      console.error(`[poller] git push fallito: ${e.message}`);
    }
    // Non marcare pushed se il push è fallito
    return 0;
  }

  // Marca tutti come pushed in Firestore
  for (const f of newFiles) {
    try {
      await f.ref.set({
        queueStatus: 'pushed',
        pushedAt: admin.firestore.FieldValue.serverTimestamp(),
        taskFile: `tasks/${f.fname}`,
      }, { merge: true });
      // Aggiorna anche il doc principale in nexo_dev_requests
      await db.collection('nexo_dev_requests').doc(f.id).set({
        status: 'analyzing',
        taskFile: `tasks/${f.fname}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error(`[poller] update queueStatus fallito per ${f.id}: ${e.message}`);
    }
  }

  return newFiles.length;
}

async function main() {
  const once = process.argv.includes('--once');
  console.log(`[poller] dev_request_poller avviato (project=${FIREBASE_PROJECT}, repo=${REPO_DIR})`);

  if (once) {
    const n = await processQueueOnce();
    console.log(`[poller] done one-shot (processed=${n})`);
    return;
  }

  while (true) {
    try {
      await processQueueOnce();
    } catch (e) {
      console.error(`[poller] iter error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(e => {
  console.error('[poller] fatal:', e);
  process.exit(1);
});
