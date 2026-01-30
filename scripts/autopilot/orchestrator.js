/**
 * SmartCookBook Autopilot Orchestrator
 *
 * Central coordinator for all autonomous AI agents.
 * Manages agent execution, change pipelines, and notifications.
 */

import Anthropic from '@anthropic-ai/sdk';
import simpleGit from 'simple-git';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config();

// ── Firestore initialization ──
let firestoreDB = null;

async function initFirestore() {
  if (getApps().length > 0) {
    firestoreDB = getFirestore();
    return;
  }

  // Try service account key from env or local path
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!keyPath) {
    console.log('[Firestore] No service account key configured - reports will not be persisted');
    return;
  }

  try {
    const keyFile = JSON.parse(await fs.readFile(path.resolve(keyPath), 'utf-8'));
    initializeApp({ credential: cert(keyFile) });
    firestoreDB = getFirestore();
    console.log('[Firestore] Connected for report persistence');
  } catch (err) {
    console.warn('[Firestore] Init failed:', err.message, '- reports will not be persisted');
  }
}

/**
 * Save agent report to Firestore for the dashboard
 */
async function saveReportToFirestore(report, agentResult = {}) {
  if (!firestoreDB) return;

  try {
    const reportData = {
      agentName: report.agent,
      status: report.errors.length > 0 ? 'failed' : (report.changes.length > 0 ? 'success' : 'success'),
      timestamp: FieldValue.serverTimestamp(),
      duration: Math.round(report.duration * 1000), // ms
      changes: report.changes || [],
      issues: report.errors || [],
      prUrl: report.prUrl || null,
      prCreated: report.prCreated || false,
      testsRun: report.testsRun || false,
      testsPassing: report.testsPassing || 0,
      // Agent-specific metrics (from the agent's return value)
      metrics: agentResult.metrics || {},
      // Store full result for detail view
      fullResult: JSON.stringify(agentResult).slice(0, 900000), // Keep under 1MB Firestore limit
    };

    const ref = await firestoreDB.collection('autopilot_reports').add(reportData);
    console.log(`[Firestore] Report saved: ${ref.id}`);

    // If security scanner, also save individual alerts
    if (report.agent === 'security-scanner' && agentResult.vulnerabilities) {
      await saveSecurityAlerts(agentResult, ref.id);
    }
  } catch (err) {
    console.error('[Firestore] Failed to save report:', err.message);
  }
}

/**
 * Save security scan findings as individual alerts.
 * - Skips duplicates (same title already exists and is unacknowledged)
 * - Auto-resolves old alerts that are no longer detected
 */
async function saveSecurityAlerts(agentResult, reportId) {
  if (!firestoreDB) return;

  const alertsRef = firestoreDB.collection('autopilot_alerts');

  // 1. Get all existing unacknowledged alerts
  const existingSnap = await alertsRef.where('acknowledged', '==', false).get();
  const existingAlerts = {};
  existingSnap.docs.forEach(doc => {
    existingAlerts[doc.data().title] = doc;
  });

  // 2. Build set of currently-detected alert titles
  const currentTitles = new Set();

  const batch = firestoreDB.batch();
  let newCount = 0;

  // Vulnerabilities
  if (agentResult.vulnerabilities) {
    for (const vuln of agentResult.vulnerabilities) {
      const title = `${vuln.package}: ${vuln.via || 'vulnerability'}`;
      currentTitles.add(title);

      // Skip if already exists
      if (existingAlerts[title]) continue;

      const ref = alertsRef.doc();
      batch.set(ref, {
        type: 'vulnerability',
        severity: vuln.severity || 'medium',
        title,
        details: JSON.stringify(vuln),
        package: vuln.package || null,
        file: null,
        fixAvailable: vuln.fixAvailable || false,
        acknowledged: false,
        fixAttempted: false,
        detectedAt: FieldValue.serverTimestamp(),
        sourceReportId: reportId,
      });
      newCount++;
    }
  }

  // Secrets found
  if (agentResult.secrets) {
    for (const secret of agentResult.secrets) {
      const title = `${secret.type} found in ${secret.file}`;
      currentTitles.add(title);

      if (existingAlerts[title]) continue;

      const ref = alertsRef.doc();
      batch.set(ref, {
        type: 'secret',
        severity: 'high',
        title,
        details: `Line ${secret.line}: ${secret.preview}`,
        package: null,
        file: secret.file || null,
        fixAvailable: false,
        acknowledged: false,
        fixAttempted: false,
        detectedAt: FieldValue.serverTimestamp(),
        sourceReportId: reportId,
      });
      newCount++;
    }
  }

  // Anti-patterns
  if (agentResult.patterns) {
    for (const pattern of agentResult.patterns) {
      const title = `${pattern.pattern} in ${pattern.file}`;
      currentTitles.add(title);

      if (existingAlerts[title]) continue;

      const ref = alertsRef.doc();
      batch.set(ref, {
        type: 'pattern',
        severity: pattern.severity || 'medium',
        title,
        details: JSON.stringify(pattern),
        package: null,
        file: pattern.file || null,
        fixAvailable: false,
        acknowledged: false,
        fixAttempted: false,
        detectedAt: FieldValue.serverTimestamp(),
        sourceReportId: reportId,
      });
      newCount++;
    }
  }

  // 3. Auto-resolve alerts no longer detected (mark acknowledged + resolved)
  let resolvedCount = 0;
  for (const [title, doc] of Object.entries(existingAlerts)) {
    if (!currentTitles.has(title)) {
      batch.update(doc.ref, {
        acknowledged: true,
        fixResolved: true,
        resolvedAt: FieldValue.serverTimestamp(),
        resolvedByReportId: reportId,
      });
      resolvedCount++;
    }
  }

  if (newCount > 0 || resolvedCount > 0) {
    await batch.commit();
    console.log(`[Firestore] Alerts: ${newCount} new, ${resolvedCount} auto-resolved`);
  } else {
    console.log(`[Firestore] No alert changes (${Object.keys(existingAlerts).length} existing, all still detected)`);
  }
}

/**
 * Report live progress to Firestore for the dashboard.
 * Writes/updates a doc at `autopilot_progress/{agentName}`.
 */
async function reportProgress(agentName, phase, message, percent) {
  if (!firestoreDB) return;

  try {
    await firestoreDB.collection('autopilot_progress').doc(agentName).set({
      agentName,
      phase,
      message,
      percent,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Non-critical — don't let progress writes break the agent
    console.warn('[Firestore] Progress update failed:', err.message);
  }
}

/**
 * Clear progress doc when agent completes.
 */
async function clearProgress(agentName) {
  if (!firestoreDB) return;

  try {
    await firestoreDB.collection('autopilot_progress').doc(agentName).delete();
  } catch (err) {
    console.warn('[Firestore] Progress clear failed:', err.message);
  }
}

/**
 * Notify the documentalist agent that another agent made changes.
 * Writes to Firestore `doc_update_queue` for the documentalist to pick up.
 */
async function notifyDocumentalist(changeReport) {
  if (!firestoreDB) return;

  try {
    await firestoreDB.collection('doc_update_queue').add({
      sourceAgent: changeReport.agent,
      type: 'change-report',
      status: 'pending',
      priority: 'normal',
      createdAt: FieldValue.serverTimestamp(),
      processedAt: null,
      changeReport: {
        changedFiles: changeReport.changedFiles || [],
        summary: changeReport.summary || '',
      },
    });
    console.log(`[Firestore] Queued doc update for documentalist (from ${changeReport.agent})`);
  } catch (err) {
    console.warn('[Firestore] Failed to queue doc update:', err.message);
  }
}

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  repoRoot: path.resolve(process.cwd(), '../..'),
  projectRoot: path.resolve(process.cwd(), '../../app-new'),
  mainBranch: 'fresh-start',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  notifyEmail: process.env.NOTIFY_EMAIL || 'mageroyer@hotmail.com',
  maxChangesPerRun: 10,
  testCommand: 'npx vitest run --reporter=verbose',
  buildCommand: 'npm run build',
};

// Log the resolved path for debugging
console.log('Project root:', CONFIG.projectRoot);

// Agent definitions
const AGENTS = {
  'daily-health': {
    name: 'Daily Health Check',
    schedule: '0 6 * * *', // 6 AM daily
    description: 'Run tests, check for obvious issues, report status',
    autoFix: false,
  },
  'test-fixer': {
    name: 'Test Fixer',
    schedule: 'on-failure',
    description: 'Analyze and fix failing tests',
    autoFix: true,
  },
  'deps-updater': {
    name: 'Dependency Updater',
    schedule: '0 3 * * 0', // 3 AM Sunday
    description: 'Update dependencies, run tests, create PR if passing',
    autoFix: true,
  },
  'security-scanner': {
    name: 'Security Scanner',
    schedule: '0 4 * * 1', // 4 AM Monday
    description: 'Scan for vulnerabilities, fix if possible',
    autoFix: true,
  },
  'codebase-mapper': {
    name: 'Codebase Mapper',
    schedule: '0 1 * * 3', // Wednesday 1 AM UTC (weekly)
    description: 'Scan codebase, update manifest, detect stale docs, generate reference docs',
    autoFix: true,
    skipTests: true, // Only generates docs/ files — cannot break tests
  },
  'documentalist': {
    name: 'Documentalist',
    schedule: '0 2 * * 4', // Thursday 2 AM UTC (after codebase-mapper Wed 1 AM)
    description: 'Maintain all documentation layers — detect stale docs and refresh via AI',
    autoFix: true,
    skipTests: true, // Only generates docs/ files — cannot break tests
  },
  'code-reviewer': {
    name: 'Code Reviewer',
    schedule: 'on-pr',
    description: 'Review PRs, suggest improvements, check patterns',
    autoFix: false,
  },
  'full-audit': {
    name: 'Full Codebase Audit',
    schedule: '0 2 1 * *', // 2 AM 1st of month
    description: 'Comprehensive code quality audit',
    autoFix: false,
  },
};

/**
 * Initialize Git for the project
 */
function initGit() {
  return simpleGit(CONFIG.repoRoot);
}

/**
 * Create a new branch for agent changes
 */
async function createAgentBranch(agentName) {
  const git = initGit();
  const timestamp = new Date().toISOString().split('T')[0];
  const branchName = `autopilot/${agentName}-${timestamp}`;

  await git.checkout(CONFIG.mainBranch);
  await git.pull();

  // Delete stale remote branch if it exists (from a previous run today)
  try {
    await git.push('origin', `:refs/heads/${branchName}`);
    console.log(`Deleted stale remote branch: ${branchName}`);
  } catch {
    // Branch doesn't exist remotely — that's fine
  }

  // Delete stale local branch if it exists
  try {
    await git.deleteLocalBranch(branchName, true);
  } catch {
    // Branch doesn't exist locally — that's fine
  }

  await git.checkoutLocalBranch(branchName);

  return branchName;
}

/**
 * Run Claude to analyze/fix code
 */
async function runClaudeAgent(prompt, options = {}) {
  const client = new Anthropic({
    apiKey: CONFIG.anthropicApiKey,
  });

  const systemPrompt = `You are an autonomous code maintenance agent for SmartCookBook, a commercial kitchen management system.

Project context:
- React 19 + Vite 7 frontend
- Firebase backend (Firestore, Auth, Functions)
- ~200,000 lines of code across 310+ files
- 1,921 tests across 63 test files
- Key directories: app-new/src/components, app-new/src/services, app-new/src/pages

Your task is to ${options.task || 'analyze and improve the codebase'}.

Guidelines:
1. Always run tests after making changes
2. Create focused, atomic changes
3. Follow existing code patterns
4. Add comments explaining non-obvious changes
5. Never break existing functionality
6. Prefer minimal, targeted fixes over large refactors

Output format:
- Start with a brief analysis
- List changes you'll make
- Show the actual changes
- Report test results
- Summarize what was done`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

/**
 * Execute a shell command in the project directory
 */
async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: CONFIG.projectRoot,
      timeout: 300000, // 5 minute timeout
    });
    return { success: true, stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout, stderr: error.stderr };
  }
}

/**
 * Run tests and return results
 */
async function runTests() {
  console.log('Running tests...');
  const result = await runCommand(CONFIG.testCommand);

  const output = result.stdout || '';
  const errorOutput = result.stderr || '';

  // Parse test output for summary (supports both Vitest and Mocha formats)
  // Vitest: "Tests  1921 passed (1921)" / "Tests  3 failed (3)"
  // Mocha:  "1921 passing" / "3 failing"
  const passMatch = output.match(/(\d+)\s+pass(?:ed|ing)/) || errorOutput.match(/(\d+)\s+pass(?:ed|ing)/);
  const failMatch = output.match(/(\d+)\s+fail(?:ed|ing)/) || errorOutput.match(/(\d+)\s+fail(?:ed|ing)/);

  if (!result.success) {
    console.log('⚠️ Test command exited with error');
    // Log last 40 lines of output for debugging
    const lines = (output + '\n' + errorOutput).split('\n').filter(l => l.trim());
    const tail = lines.slice(-40).join('\n');
    console.log('--- Test output (last 40 lines) ---');
    console.log(tail);
    console.log('--- End test output ---');
  }

  return {
    success: result.success,
    passing: passMatch ? parseInt(passMatch[1]) : 0,
    failing: failMatch ? parseInt(failMatch[1]) : 0,
    output: output || errorOutput,
  };
}

/**
 * Create a PR with changes
 */
async function createPR(branchName, title, description) {
  const git = initGit();

  // Commit changes
  await git.add('.');
  await git.commit(`[Autopilot] ${title}\n\n${description}\n\nCo-Authored-By: Claude Autopilot <autopilot@anthropic.com>`);

  // Push branch
  await git.push('origin', branchName, ['--set-upstream']);

  // Create PR using gh CLI
  const prResult = await runCommand(`gh pr create --title "[Autopilot] ${title}" --body "${description.replace(/"/g, '\\"')}" --base ${CONFIG.mainBranch}`);

  return prResult;
}

/**
 * Send notification
 */
async function notify(subject, body) {
  console.log(`\n=== NOTIFICATION ===`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);
  console.log(`====================\n`);

  // In production, send email or Slack message
  // For now, just log
}

/**
 * Main orchestrator function
 */
async function orchestrate(agentName, options = {}) {
  const agent = AGENTS[agentName];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting: ${agent.name}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  // Initialize Firestore (idempotent)
  await initFirestore();

  const report = {
    agent: agentName,
    startTime: new Date(),
    changes: [],
    testsRun: false,
    testsPassing: 0,
    prCreated: false,
    prUrl: null,
    errors: [],
  };

  let agentResult = {};

  try {
    // Create branch for changes (if autoFix enabled)
    let branchName = null;
    if (agent.autoFix) {
      branchName = await createAgentBranch(agentName);
      console.log(`Created branch: ${branchName}`);
    }

    // Report initial progress
    await reportProgress(agentName, 'starting', 'Initializing agent...', 0);

    // Run the specific agent logic
    const agentModule = await import(`./agents/${agentName}.js`);
    const result = await agentModule.run({
      runClaudeAgent,
      runCommand,
      runTests,
      projectRoot: CONFIG.projectRoot,
      reportProgress: (phase, message, percent) => reportProgress(agentName, phase, message, percent),
      ...options,
    });

    agentResult = result;
    report.changes = result.changes || [];

    // Run tests if changes were made (skip for docs-only agents)
    if (report.changes.length > 0 && agent.autoFix) {
      let testsOk = true;

      if (agent.skipTests) {
        console.log('Skipping tests (docs-only agent)');
      } else {
        const testResult = await runTests();
        report.testsRun = true;
        report.testsPassing = testResult.passing;
        testsOk = testResult.success;
      }

      if (testsOk) {
        // Create PR
        const prResult = await createPR(
          branchName,
          `${agent.name}: ${report.changes.length} changes`,
          generatePRDescription(report)
        );
        report.prCreated = true;
        report.prUrl = prResult.stdout?.trim();
      } else {
        report.errors.push(`Tests failed: ${report.testsPassing} passing, check logs for details`);
        // Revert changes
        const git = initGit();
        await git.checkout(CONFIG.mainBranch);
        await git.deleteLocalBranch(branchName, true);
      }
    }

    // Notify documentalist if another agent made changes
    if (report.changes.length > 0 && agentName !== 'documentalist') {
      await notifyDocumentalist({
        agent: agentName,
        changedFiles: agentResult.changedFiles || [],
        summary: report.changes.join('; '),
      });
    }

  } catch (error) {
    report.errors.push(error.message);
    console.error('Agent error:', error);
  }

  // Clear live progress now that agent is done
  await clearProgress(agentName);

  report.endTime = new Date();
  report.duration = (report.endTime - report.startTime) / 1000;

  // Generate and send report
  const reportText = generateReport(report);
  console.log(reportText);

  // Persist report to Firestore (for dashboard)
  await saveReportToFirestore(report, agentResult);

  if (report.errors.length > 0 || report.prCreated) {
    await notify(
      `[SmartCookBook Autopilot] ${agent.name} - ${report.errors.length > 0 ? 'Issues Found' : 'PR Created'}`,
      reportText
    );
  }

  return report;
}

/**
 * Generate PR description
 */
function generatePRDescription(report) {
  return `## Autopilot Changes

**Agent:** ${AGENTS[report.agent].name}
**Changes:** ${report.changes.length}
**Tests:** ${report.testsPassing} passing

### Changes Made
${report.changes.map(c => `- ${c}`).join('\n')}

---
*This PR was automatically generated by SmartCookBook Autopilot*
`;
}

/**
 * Generate report
 */
function generateReport(report) {
  return `
## Autopilot Report: ${AGENTS[report.agent].name}

**Duration:** ${report.duration.toFixed(1)}s
**Changes:** ${report.changes.length}
**Tests Run:** ${report.testsRun ? 'Yes' : 'No'}
**Tests Passing:** ${report.testsPassing}
**PR Created:** ${report.prCreated ? 'Yes' : 'No'}
${report.prUrl ? `**PR URL:** ${report.prUrl}` : ''}

### Changes
${report.changes.length > 0 ? report.changes.map(c => `- ${c}`).join('\n') : 'No changes made'}

### Errors
${report.errors.length > 0 ? report.errors.map(e => `- ${e}`).join('\n') : 'None'}
`;
}

// CLI handler
const agentName = process.argv[2];
const agentMode = process.argv[3] || undefined; // Optional mode (e.g., 'init', 'update', 'digest')
if (agentName) {
  const options = agentMode ? { mode: agentMode } : {};
  orchestrate(agentName, options)
    .then(report => {
      process.exit(report.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Orchestrator failed:', error);
      process.exit(1);
    });
} else {
  console.log('Available agents:', Object.keys(AGENTS).join(', '));
  console.log('Usage: node orchestrator.js <agent-name> [mode]');
}

export { orchestrate, AGENTS, runClaudeAgent, runCommand, runTests };
