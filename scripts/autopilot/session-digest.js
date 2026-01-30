#!/usr/bin/env node
/**
 * Session Digest CLI
 *
 * Submit a Claude Code session summary to the doc_update_queue
 * for the Documentalist agent to process.
 *
 * Usage:
 *   node session-digest.js --file=session-summary.txt
 *   echo "Session summary..." | node session-digest.js
 *   node session-digest.js --text="Brief session summary"
 */

import fs from 'fs/promises';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

async function initFirestore() {
  if (getApps().length > 0) return getFirestore();

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!keyPath) {
    console.error('Error: FIREBASE_SERVICE_ACCOUNT env var not set.');
    console.error('Set it to the path of your Firebase service account JSON file.');
    process.exit(1);
  }

  const keyFile = JSON.parse(await fs.readFile(path.resolve(keyPath), 'utf-8'));
  initializeApp({ credential: cert(keyFile) });
  return getFirestore();
}

async function submitDigest(summaryText) {
  const db = await initFirestore();

  const ref = await db.collection('doc_update_queue').add({
    sourceAgent: 'session-digest-cli',
    type: 'session-digest',
    status: 'pending',
    priority: 'normal',
    createdAt: FieldValue.serverTimestamp(),
    processedAt: null,
    sessionData: {
      summary: summaryText,
      submittedAt: new Date().toISOString(),
      source: 'cli',
    },
  });

  console.log(`Session digest submitted: ${ref.id}`);
  console.log(`The Documentalist agent will process it on its next run.`);
  console.log(`Or trigger manually: node orchestrator.js documentalist digest`);
}

async function main() {
  const args = process.argv.slice(2);
  let summaryText = '';

  // Check --file argument
  const fileArg = args.find(a => a.startsWith('--file='));
  if (fileArg) {
    const filePath = fileArg.split('=')[1];
    summaryText = await fs.readFile(path.resolve(filePath), 'utf-8');
  }

  // Check --text argument
  const textArg = args.find(a => a.startsWith('--text='));
  if (textArg) {
    summaryText = textArg.split('=').slice(1).join('=');
  }

  // Check stdin (piped input)
  if (!summaryText && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    summaryText = Buffer.concat(chunks).toString('utf-8');
  }

  if (!summaryText.trim()) {
    console.log('Session Digest CLI — Submit session summaries for documentation extraction');
    console.log('');
    console.log('Usage:');
    console.log('  node session-digest.js --file=summary.txt');
    console.log('  node session-digest.js --text="Brief summary of what was done"');
    console.log('  echo "Session summary..." | node session-digest.js');
    process.exit(0);
  }

  console.log(`Submitting session digest (${summaryText.length} chars)...`);
  await submitDigest(summaryText.trim());
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
