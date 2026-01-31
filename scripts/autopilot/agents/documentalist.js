/**
 * Documentalist Agent
 *
 * Intelligent living documentation system that keeps docs in sync with code.
 *
 * Modes:
 *   update  — (default) Detect stale docs via coverage.json, refresh top 5 via Claude
 *   init    — First-run: generate all missing doc layers (Increment 2)
 *   digest  — Process session summaries into structured docs (Increment 4)
 *   review  — AI-assisted interactive review of generated docs (Increment 5)
 *
 * Reads:
 *   docs/manifest.json  — Machine-readable codebase map (from codebase-mapper)
 *   docs/coverage.json  — Staleness + JSDoc coverage (from codebase-mapper)
 *
 * Writes:
 *   docs/doc_health.json — Per-layer health scores
 *   docs/(various).md    — Updated documentation files
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Configuration ──

const DOCS_DIR = path.resolve(process.cwd(), '../../docs');
const MANIFEST_PATH = path.join(DOCS_DIR, 'manifest.json');
const COVERAGE_PATH = path.join(DOCS_DIR, 'coverage.json');
const HEALTH_PATH = path.join(DOCS_DIR, 'doc_health.json');

/** Max docs to update per run (cost control: ~5 Claude calls ≈ $0.25) */
const MAX_UPDATES_PER_RUN = 5;

/**
 * Documentation Registry
 *
 * Maps each known doc to its metadata:
 *   layer      — Documentation layer (0-12)
 *   path       — Relative path from project root
 *   automation — 'auto' (fully generated), 'assisted' (AI-refreshable), 'manual'
 *   covers     — Glob patterns of source code this doc describes
 */
const DOC_REGISTRY = {
  // Layer 1: Machine-readable
  'manifest.json': {
    layer: 1,
    path: 'docs/manifest.json',
    automation: 'auto',
    covers: ['src/**'],
  },
  'coverage.json': {
    layer: 1,
    path: 'docs/coverage.json',
    automation: 'auto',
    covers: ['src/**', 'docs/**'],
  },

  // Layer 3: Auto-generated references
  'COMPONENT_CATALOG.md': {
    layer: 3,
    path: 'docs/COMPONENT_CATALOG.md',
    automation: 'auto',
    covers: ['src/components/**'],
  },
  'SERVICE_REFERENCE.md': {
    layer: 3,
    path: 'docs/SERVICE_REFERENCE.md',
    automation: 'auto',
    covers: ['src/services/**'],
  },
  'PAGES_REFERENCE.md': {
    layer: 3,
    path: 'docs/PAGES_REFERENCE.md',
    automation: 'auto',
    covers: ['src/pages/**'],
  },
  'HOOKS_REFERENCE.md': {
    layer: 3,
    path: 'docs/HOOKS_REFERENCE.md',
    automation: 'auto',
    covers: ['src/hooks/**', 'src/components/**/use*.js'],
  },

  // Layer 4: System maps
  'SYSTEM_MAP.md': {
    layer: 4,
    path: 'docs/SYSTEM_MAP.md',
    automation: 'auto',
    covers: ['src/**'],
  },

  // Layer 5: Architecture (AI-assisted refresh)
  'SYSTEM_ARCHITECTURE.md': {
    layer: 5,
    path: 'docs/architecture/SYSTEM_ARCHITECTURE.md',
    automation: 'assisted',
    covers: ['src/services/**', 'src/components/**', 'src/pages/**'],
  },
  'INVOICE_ARCHITECTURE.md': {
    layer: 5,
    path: 'docs/architecture/INVOICE_ARCHITECTURE.md',
    automation: 'assisted',
    covers: ['src/services/invoice/**', 'src/components/invoice/**'],
  },
  'DATABASE_SCHEMA.md': {
    layer: 5,
    path: 'docs/architecture/DATABASE_SCHEMA.md',
    automation: 'assisted',
    covers: ['src/services/database/**'],
  },
  'INVENTORY_SYSTEM.md': {
    layer: 5,
    path: 'docs/architecture/INVENTORY_SYSTEM.md',
    automation: 'assisted',
    covers: ['src/services/inventory/**', 'src/components/inventory/**'],
  },
  'INVENTORY_SCHEMA.md': {
    layer: 5,
    path: 'docs/architecture/INVENTORY_SCHEMA.md',
    automation: 'assisted',
    covers: ['src/services/inventory/**'],
  },
  'API_REFERENCE.md': {
    layer: 5,
    path: 'docs/architecture/API_REFERENCE.md',
    automation: 'assisted',
    covers: ['src/services/**'],
  },

  // Layer 7: Guides (AI-assisted)
  'USER_GUIDE.md': {
    layer: 7,
    path: 'docs/guides/USER_GUIDE.md',
    automation: 'assisted',
    covers: ['src/pages/**', 'src/components/**'],
  },
  'WEBSITE_BUILDER.md': {
    layer: 7,
    path: 'docs/guides/WEBSITE_BUILDER.md',
    automation: 'assisted',
    covers: ['src/components/website/**', 'src/services/database/websiteDB.js'],
  },
  'VOICE_RECOGNITION_GUIDE.md': {
    layer: 7,
    path: 'docs/guides/VOICE_RECOGNITION_GUIDE.md',
    automation: 'assisted',
    covers: ['src/services/voice/**', 'src/components/voice/**'],
  },
  'TESTING_GUIDE.md': {
    layer: 7,
    path: 'docs/guides/TESTING_GUIDE.md',
    automation: 'assisted',
    covers: ['src/**/*.test.js', 'src/**/*.spec.js'],
  },
  'DEPLOYMENT_CHECKLIST.md': {
    layer: 7,
    path: 'docs/guides/DEPLOYMENT_CHECKLIST.md',
    automation: 'manual',
    covers: [],
  },
  'ENVIRONMENT_SETUP.md': {
    layer: 7,
    path: 'docs/guides/ENVIRONMENT_SETUP.md',
    automation: 'manual',
    covers: [],
  },

  // Layer 6: Architecture Decision Records (init-generated)
  'adrs/INDEX.md': {
    layer: 6,
    path: 'docs/adrs/INDEX.md',
    automation: 'auto',
    covers: ['docs/adrs/**'],
  },

  // Layer 8: Risk management
  'RISK_REGISTER.md': {
    layer: 8,
    path: 'docs/RISK_REGISTER.md',
    automation: 'assisted',
    covers: ['src/**'],
  },

  // Layer 9: Change history
  'CHANGELOG.md': {
    layer: 9,
    path: 'docs/CHANGELOG.md',
    automation: 'auto',
    covers: [],
  },

  // Layer 10: Domain knowledge
  'GLOSSARY.md': {
    layer: 10,
    path: 'docs/GLOSSARY.md',
    automation: 'assisted',
    covers: ['src/**'],
  },

  // Layer 4: Onboarding
  'ONBOARDING.md': {
    layer: 4,
    path: 'docs/ONBOARDING.md',
    automation: 'assisted',
    covers: ['src/**'],
  },
};

// ══════════════════════════════════════════════════
//  SECTION 1: SHARED UTILITIES
// ══════════════════════════════════════════════════

async function loadJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[Documentalist] Could not load ${filePath}: ${err.message}`);
    return null;
  }
}

async function loadManifest() {
  return loadJSON(MANIFEST_PATH);
}

async function loadCoverage() {
  return loadJSON(COVERAGE_PATH);
}

/**
 * Read source files that a doc covers (for context when updating).
 * Returns a map of { filePath: content } for the most relevant files.
 * Limits to ~30 files to keep Claude prompt size reasonable.
 */
async function readSourceFiles(manifest, coverPatterns, projectRoot) {
  if (!manifest || !manifest.files || !coverPatterns || coverPatterns.length === 0) {
    return {};
  }

  const sources = {};
  const allFiles = Object.keys(manifest.files);
  let count = 0;

  for (const pattern of coverPatterns) {
    // Convert glob pattern to regex for matching
    const regexStr = pattern
      .replace(/\*\*/g, '<<DOUBLESTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<DOUBLESTAR>>/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);

    for (const filePath of allFiles) {
      if (count >= 30) break;
      if (regex.test(filePath)) {
        try {
          const fullPath = path.join(projectRoot, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          // Only include first 200 lines to stay within context limits
          const truncated = content.split('\n').slice(0, 200).join('\n');
          sources[filePath] = truncated;
          count++;
        } catch {
          // Skip unreadable files
        }
      }
    }
    if (count >= 30) break;
  }

  return sources;
}

/**
 * Read the current content of a documentation file.
 */
async function readDocFile(docRelativePath, projectRoot) {
  try {
    const fullPath = path.join(projectRoot, '..', docRelativePath);
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get Firestore instance (if initialized by the orchestrator).
 */
function getDB() {
  try {
    if (getApps().length > 0) return getFirestore();
  } catch {
    // Not initialized
  }
  return null;
}

/**
 * Read pending items from the doc_update_queue Firestore collection.
 * These are change notifications from other agents.
 */
async function readDocQueue() {
  const db = getDB();
  if (!db) return [];

  try {
    const snap = await db.collection('doc_update_queue')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(20)
      .get();

    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn(`[Documentalist] Failed to read doc queue: ${err.message}`);
    return [];
  }
}

/**
 * Mark queue items as processed in Firestore.
 */
async function markQueueProcessed(itemIds) {
  const db = getDB();
  if (!db || itemIds.length === 0) return;

  try {
    const batch = db.batch();
    for (const id of itemIds) {
      batch.update(db.collection('doc_update_queue').doc(id), {
        status: 'completed',
        processedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`  [Queue] Marked ${itemIds.length} item(s) as processed`);
  } catch (err) {
    console.warn(`[Documentalist] Failed to mark queue items: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════
//  SECTION 2: STALENESS ENGINE
// ══════════════════════════════════════════════════

/**
 * Get stale docs from coverage.json, sorted by staleness (most stale first).
 * Only includes docs with automation === 'assisted' (AI can refresh them).
 */
function getStaleDocsFromCoverage(coverage) {
  if (!coverage || !coverage.staleness) return [];

  const staleDocs = [];

  for (const [docPath, stalenessInfo] of Object.entries(coverage.staleness)) {
    if (!stalenessInfo.stale || stalenessInfo.staleDays <= 0) continue;

    // Find registry entry for this doc
    const docName = path.basename(docPath);
    const registryEntry = DOC_REGISTRY[docName];

    // Only update AI-assisted docs (auto docs are generated by codebase-mapper)
    if (!registryEntry || registryEntry.automation !== 'assisted') continue;

    staleDocs.push({
      docName,
      docPath: registryEntry.path,
      staleDays: stalenessInfo.staleDays,
      lastDocUpdate: stalenessInfo.lastDocUpdate,
      latestCodeChange: stalenessInfo.latestCodeChange,
      covers: registryEntry.covers,
      layer: registryEntry.layer,
    });
  }

  // Sort by staleness: most stale first
  staleDocs.sort((a, b) => b.staleDays - a.staleDays);

  return staleDocs;
}

// ══════════════════════════════════════════════════
//  SECTION 3: DOC UPDATER
// ══════════════════════════════════════════════════

/**
 * Update a single documentation file using Claude.
 *
 * Reads the current doc content + relevant source files,
 * sends both to Claude, and writes back the refreshed doc.
 */
async function updateDoc(staleDoc, manifest, projectRoot, runClaudeAgent) {
  const currentContent = await readDocFile(staleDoc.docPath, projectRoot);
  if (!currentContent) {
    console.log(`  [Skip] ${staleDoc.docName}: file not found at ${staleDoc.docPath}`);
    return null;
  }

  // Read source files this doc covers
  const sources = await readSourceFiles(manifest, staleDoc.covers, projectRoot);
  const sourceCount = Object.keys(sources).length;

  if (sourceCount === 0) {
    console.log(`  [Skip] ${staleDoc.docName}: no matching source files found`);
    return null;
  }

  // Build source context string
  const sourceContext = Object.entries(sources)
    .map(([filePath, content]) => `--- ${filePath} ---\n${content}`)
    .join('\n\n');

  const prompt = `You are a documentation maintenance agent for SmartCookBook, a commercial kitchen management app.

TASK: Update the following documentation file to reflect the current source code.
The doc is ${staleDoc.staleDays} days behind the latest code changes.

RULES:
1. Preserve the document's existing structure, headings, and style
2. Update content that is outdated based on the source code
3. Add new sections for significant new features found in source code
4. Remove references to code that no longer exists
5. Keep the tone professional and consistent with the existing doc
6. Do NOT add placeholder or speculative content
7. Return the COMPLETE updated document (not a diff)

CURRENT DOCUMENT (${staleDoc.docName}):
\`\`\`markdown
${currentContent}
\`\`\`

CURRENT SOURCE CODE (${sourceCount} files):
${sourceContext}

Return ONLY the updated markdown content. No commentary or explanation before/after.`;

  console.log(`  Updating ${staleDoc.docName} (${staleDoc.staleDays}d stale, ${sourceCount} source files)...`);

  try {
    const updatedContent = await runClaudeAgent(prompt, {
      task: `update documentation file ${staleDoc.docName}`,
    });

    // Strip markdown code fences if Claude wrapped the output
    let cleaned = updatedContent.trim();
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.slice('```markdown'.length);
    } else if (cleaned.startsWith('```md')) {
      cleaned = cleaned.slice('```md'.length);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Write updated doc
    const fullPath = path.join(projectRoot, '..', staleDoc.docPath);
    await fs.writeFile(fullPath, cleaned + '\n');

    return {
      docName: staleDoc.docName,
      staleDays: staleDoc.staleDays,
      sourceFilesUsed: sourceCount,
      updated: true,
    };
  } catch (err) {
    console.error(`  [Error] Failed to update ${staleDoc.docName}: ${err.message}`);
    return {
      docName: staleDoc.docName,
      staleDays: staleDoc.staleDays,
      updated: false,
      error: err.message,
    };
  }
}

// ══════════════════════════════════════════════════
//  SECTION 4: DOC HEALTH REPORT
// ══════════════════════════════════════════════════

/**
 * Generate doc_health.json — per-layer health scores.
 */
function generateDocHealth(coverage, updatedDocs) {
  const layers = {};

  // Initialize layers from registry
  for (const [docName, entry] of Object.entries(DOC_REGISTRY)) {
    const layerKey = `layer_${entry.layer}`;
    if (!layers[layerKey]) {
      layers[layerKey] = {
        layer: entry.layer,
        docs: [],
        totalDocs: 0,
        staleDocs: 0,
        freshDocs: 0,
        healthScore: 100,
      };
    }

    const stalenessInfo = coverage?.staleness?.[entry.path] ||
      coverage?.staleness?.[`docs/${docName}`];

    const isStale = stalenessInfo?.stale || false;
    const staleDays = stalenessInfo?.staleDays || 0;
    const wasUpdated = updatedDocs.some(d => d.docName === docName && d.updated);

    layers[layerKey].docs.push({
      name: docName,
      path: entry.path,
      automation: entry.automation,
      stale: wasUpdated ? false : isStale,
      staleDays: wasUpdated ? 0 : staleDays,
      justUpdated: wasUpdated,
    });

    layers[layerKey].totalDocs++;
    if (wasUpdated ? false : isStale) {
      layers[layerKey].staleDocs++;
    } else {
      layers[layerKey].freshDocs++;
    }
  }

  // Compute health scores per layer
  for (const layer of Object.values(layers)) {
    if (layer.totalDocs === 0) {
      layer.healthScore = 100;
    } else {
      layer.healthScore = Math.round((layer.freshDocs / layer.totalDocs) * 100);
    }
  }

  // Overall health
  const totalDocs = Object.values(layers).reduce((sum, l) => sum + l.totalDocs, 0);
  const totalFresh = Object.values(layers).reduce((sum, l) => sum + l.freshDocs, 0);
  const overallHealth = totalDocs > 0 ? Math.round((totalFresh / totalDocs) * 100) : 100;

  return {
    generatedAt: new Date().toISOString(),
    overallHealth,
    totalDocs,
    freshDocs: totalFresh,
    staleDocs: totalDocs - totalFresh,
    layers,
    lastUpdated: updatedDocs.filter(d => d.updated).map(d => d.docName),
  };
}

// ══════════════════════════════════════════════════
//  SECTION 5: MODE ROUTER
// ══════════════════════════════════════════════════

/**
 * Main entry point for the Documentalist agent.
 *
 * @param {Object} context - Orchestrator-injected context
 * @param {Function} context.runClaudeAgent - Claude API wrapper
 * @param {string} context.projectRoot - Path to app-new/
 * @param {Function} context.reportProgress - Progress callback
 * @param {string} [context.mode] - 'update' (default), 'init', or 'digest'
 */
export async function run(context) {
  const {
    runClaudeAgent,
    projectRoot,
    reportProgress,
    mode = 'update',
  } = context;

  const progress = reportProgress || (() => {});

  console.log(`\nDocumentalist Agent — Mode: ${mode}\n`);

  switch (mode) {
    case 'update':
      return runUpdate({ runClaudeAgent, projectRoot, progress });
    case 'init':
      return runInit({ runClaudeAgent, projectRoot, progress });
    case 'digest':
      return runDigest({ runClaudeAgent, projectRoot, progress });
    case 'review':
      return runReview({ runClaudeAgent, projectRoot, progress });
    default:
      console.error(`[Documentalist] Unknown mode: ${mode}`);
      return { changes: [], metrics: {}, errors: [`Unknown mode: ${mode}`] };
  }
}

// ══════════════════════════════════════════════════
//  SECTION 6: UPDATE MODE
// ══════════════════════════════════════════════════

/**
 * Update mode: detect stale docs and refresh them via Claude.
 *
 * Steps:
 *   1. Load manifest.json + coverage.json
 *   2. Get stale docs (assisted only) from coverage
 *   3. Prioritize by staleness, cap at MAX_UPDATES_PER_RUN
 *   4. For each: read current doc + source files, ask Claude to refresh
 *   5. Write updated docs back
 *   6. Generate doc_health.json
 *   7. Return report
 */
async function runUpdate({ runClaudeAgent, projectRoot, progress }) {
  const report = { changes: [], metrics: {} };

  // ── Step 1: Load data from codebase-mapper ──
  await progress('loading', 'Loading manifest + coverage...', 5);
  console.log('Step 1: Loading manifest + coverage...');

  const manifest = await loadManifest();
  const coverage = await loadCoverage();

  if (!manifest) {
    const msg = 'manifest.json not found — run codebase-mapper first';
    console.error(`  ERROR: ${msg}`);
    report.changes.push(`Skipped: ${msg}`);
    return report;
  }

  if (!coverage) {
    const msg = 'coverage.json not found — run codebase-mapper first';
    console.error(`  ERROR: ${msg}`);
    report.changes.push(`Skipped: ${msg}`);
    return report;
  }

  const fileCount = Object.keys(manifest.files || {}).length;
  console.log(`  Loaded manifest (${fileCount} files) + coverage (${coverage.staleDocCount || 0} stale docs)\n`);

  // ── Step 1b: Check inter-agent queue ──
  await progress('queue', 'Checking update queue...', 10);
  console.log('Step 1b: Checking doc_update_queue...');

  const queueItems = await readDocQueue();
  const processedQueueIds = [];

  if (queueItems.length > 0) {
    console.log(`  Found ${queueItems.length} queued update(s) from other agents:`);
    for (const item of queueItems) {
      console.log(`    - ${item.sourceAgent}: ${item.changeReport?.summary?.slice(0, 80) || 'no summary'}`);
      processedQueueIds.push(item.id);
    }
    report.changes.push(`Processed ${queueItems.length} queued update(s) from other agents`);
  } else {
    console.log('  No queued updates from other agents');
  }

  // ── Step 2: Identify stale docs ──
  await progress('analyzing', 'Analyzing doc staleness...', 15);
  console.log('\nStep 2: Identifying stale docs...');

  let staleDocs = getStaleDocsFromCoverage(coverage);

  // Boost priority of docs affected by queue items
  if (queueItems.length > 0) {
    const affectedPatterns = new Set();
    for (const item of queueItems) {
      const files = item.changeReport?.changedFiles || [];
      for (const f of files) {
        // Extract directory pattern from changed file path
        const dir = path.dirname(f).replace(/\\/g, '/');
        affectedPatterns.add(dir);
      }
    }

    if (affectedPatterns.size > 0) {
      // Check which registry docs cover these patterns and add them if not already stale
      for (const [docName, entry] of Object.entries(DOC_REGISTRY)) {
        if (entry.automation !== 'assisted') continue;
        if (staleDocs.some(d => d.docName === docName)) continue;

        const isAffected = entry.covers.some(coverPattern => {
          const coverDir = coverPattern.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
          return [...affectedPatterns].some(p => p.includes(coverDir) || coverDir.includes(p));
        });

        if (isAffected) {
          staleDocs.push({
            docName,
            docPath: entry.path,
            staleDays: 1, // Queue-boosted: treat as 1 day stale
            covers: entry.covers,
            layer: entry.layer,
            queueBoosted: true,
          });
          console.log(`    + ${docName} (queue-boosted: affected by agent changes)`);
        }
      }
    }
  }

  if (staleDocs.length === 0) {
    console.log('  All assisted docs are up to date!');
    report.changes.push('All documentation is up to date — no updates needed');

    // Mark queue items as processed even if no docs updated
    await markQueueProcessed(processedQueueIds);

    // Still generate health report
    const health = generateDocHealth(coverage, []);
    await fs.writeFile(HEALTH_PATH, JSON.stringify(health, null, 2));
    report.changes.push(`Generated doc_health.json (${health.overallHealth}% overall health)`);
    report.metrics = {
      overallHealth: health.overallHealth,
      totalDocs: health.totalDocs,
      staleDocs: 0,
      docsUpdated: 0,
    };

    await progress('complete', 'All docs up to date', 100);
    return report;
  }

  console.log(`  Found ${staleDocs.length} stale doc(s):`);
  for (const doc of staleDocs) {
    console.log(`    - ${doc.docName}: ${doc.staleDays} days behind`);
  }

  // ── Step 3: Prioritize and cap ──
  const toUpdate = staleDocs.slice(0, MAX_UPDATES_PER_RUN);
  const skipped = staleDocs.length - toUpdate.length;

  if (skipped > 0) {
    console.log(`\n  Will update ${toUpdate.length} (skipping ${skipped} — max ${MAX_UPDATES_PER_RUN} per run)`);
  }

  // ── Step 4: Update each stale doc ──
  await progress('updating', `Updating ${toUpdate.length} docs...`, 25);
  console.log(`\nStep 3: Updating ${toUpdate.length} doc(s)...\n`);

  const updatedDocs = [];

  for (let i = 0; i < toUpdate.length; i++) {
    const doc = toUpdate[i];
    const pct = 25 + Math.round(((i + 1) / toUpdate.length) * 55);
    await progress('updating', `Updating ${doc.docName}...`, pct);

    const result = await updateDoc(doc, manifest, projectRoot, runClaudeAgent);
    if (result) {
      updatedDocs.push(result);
      if (result.updated) {
        report.changes.push(`Updated ${result.docName} (was ${result.staleDays}d stale, used ${result.sourceFilesUsed} source files)`);
      } else {
        report.changes.push(`Failed to update ${result.docName}: ${result.error}`);
      }
    }
  }

  // ── Step 4b: Mark queue items as processed ──
  await markQueueProcessed(processedQueueIds);

  // ── Step 5: Generate doc_health.json ──
  await progress('health', 'Generating doc health report...', 85);
  console.log('\nStep 5: Generating doc_health.json...');

  const health = generateDocHealth(coverage, updatedDocs);
  await fs.writeFile(HEALTH_PATH, JSON.stringify(health, null, 2));

  const successCount = updatedDocs.filter(d => d.updated).length;
  console.log(`  Health: ${health.overallHealth}% overall (${health.freshDocs}/${health.totalDocs} fresh)`);
  report.changes.push(`Generated doc_health.json — ${health.overallHealth}% overall health`);

  // ── Step 6: Build metrics ──
  report.metrics = {
    overallHealth: health.overallHealth,
    totalDocs: health.totalDocs,
    staleDocs: health.staleDocs,
    docsUpdated: successCount,
    docsSkipped: skipped,
  };

  // ── GitHub Actions Summary ──
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fsMod = await import('fs');
    const ghSummary = `## Documentalist Report

| Metric | Value |
|--------|-------|
| **Overall Health** | ${health.overallHealth}% |
| **Total Docs** | ${health.totalDocs} |
| **Docs Updated** | ${successCount} |
| **Still Stale** | ${health.staleDocs} |

### Updated Documents
${updatedDocs.filter(d => d.updated).map(d => `- **${d.docName}** — was ${d.staleDays}d stale, refreshed from ${d.sourceFilesUsed} source files`).join('\n') || 'None'}

### Layer Health
| Layer | Health | Fresh / Total |
|-------|--------|---------------|
${Object.values(health.layers).map(l => `| Layer ${l.layer} | ${l.healthScore}% | ${l.freshDocs}/${l.totalDocs} |`).join('\n')}

---
*Generated by SmartCookBook Autopilot — Documentalist at ${new Date().toISOString()}*
`;
    fsMod.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ghSummary);
  }

  await progress('complete', `Updated ${successCount} docs`, 100);

  // ── Summary ──
  console.log('\n=== DOCUMENTALIST SUMMARY ===');
  console.log(`Docs updated: ${successCount}/${toUpdate.length}`);
  console.log(`Overall health: ${health.overallHealth}%`);
  console.log(`Still stale: ${health.staleDocs}`);

  return report;
}

// ══════════════════════════════════════════════════
//  SECTION 7: DOCUMENT GENERATORS
// ══════════════════════════════════════════════════

/**
 * Strip markdown code fences from Claude output.
 */
function stripFences(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```markdown')) cleaned = cleaned.slice('```markdown'.length);
  else if (cleaned.startsWith('```md')) cleaned = cleaned.slice('```md'.length);
  else if (cleaned.startsWith('```json')) cleaned = cleaned.slice('```json'.length);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

/**
 * Get recent git commits for context.
 * Returns array of { hash, date, message }.
 */
function getGitHistory(projectRoot, maxCommits = 100) {
  try {
    const raw = execSync(
      `git log --oneline --format="%H|%ai|%s" -n ${maxCommits}`,
      { cwd: projectRoot, encoding: 'utf-8', timeout: 15000 }
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map(line => {
      const [hash, date, ...msgParts] = line.split('|');
      return { hash: hash.trim(), date: date?.split(' ')[0] || '', message: msgParts.join('|').trim() };
    }).filter(c => c.hash);
  } catch {
    return [];
  }
}

/**
 * Generate GLOSSARY.md — domain terms extracted from codebase by Claude.
 */
async function generateGlossary(manifest, runClaudeAgent) {
  // Gather service + component names as seed context
  const fileNames = Object.keys(manifest.files || {}).slice(0, 100);
  const serviceFiles = fileNames.filter(f => f.includes('/services/')).map(f => path.basename(f, path.extname(f)));
  const componentFiles = fileNames.filter(f => f.includes('/components/')).map(f => path.basename(f, path.extname(f)));

  const prompt = `You are a documentation agent for SmartCookBook, a commercial kitchen management app built with React + Firebase.

TASK: Generate a GLOSSARY.md of domain-specific terms used in this codebase.

CONTEXT — Service files: ${serviceFiles.join(', ')}
CONTEXT — Component files: ${componentFiles.join(', ')}

The app manages: recipes, invoices, inventory, vendors, tasks (prep lists), in-house production,
par levels, price calculations, voice dictation, auto-generated public websites, and credit-based API usage.

Generate a comprehensive glossary with:
1. **Business Domain Terms** — par level, handler, in-house production, prep list, yield, etc.
2. **Technical Terms** — IndexedDB, Firestore, Cloud Functions, Vision parser, etc.
3. **Codebase-Specific Terms** — orchestrator, codebase-mapper, autopilot agent, etc.

Format each entry as:
### Term Name
Definition in 1-3 sentences. Include context about where this term is used in the codebase.

Start with a title and brief intro. Sort alphabetically within each category.
Return ONLY the markdown content.`;

  const content = await runClaudeAgent(prompt, { task: 'generate glossary' });
  return stripFences(content);
}

/**
 * Generate CHANGELOG.md — parsed from git history.
 * Groups commits by week, categorizes by type.
 */
function generateChangelog(projectRoot) {
  const commits = getGitHistory(path.join(projectRoot, '..'), 200);
  if (commits.length === 0) {
    return '# Changelog\n\nNo git history available.\n';
  }

  // Group by week
  const weeks = {};
  for (const commit of commits) {
    if (!commit.date) continue;
    const d = new Date(commit.date);
    // Get Monday of that week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const weekKey = monday.toISOString().split('T')[0];
    if (!weeks[weekKey]) weeks[weekKey] = [];
    weeks[weekKey].push(commit);
  }

  // Categorize commits
  function categorize(msg) {
    const lower = msg.toLowerCase();
    if (lower.startsWith('fix') || lower.includes('bug')) return 'Fixed';
    if (lower.startsWith('add') || lower.startsWith('create') || lower.startsWith('implement')) return 'Added';
    if (lower.startsWith('update') || lower.startsWith('refactor') || lower.startsWith('improve')) return 'Changed';
    if (lower.startsWith('remove') || lower.startsWith('delete') || lower.startsWith('clean')) return 'Removed';
    if (lower.startsWith('[autopilot]')) return 'Autopilot';
    return 'Other';
  }

  let md = `# Changelog

All notable changes to SmartCookBook, auto-generated from git history.

Format follows [Keep a Changelog](https://keepachangelog.com/).

`;

  const sortedWeeks = Object.keys(weeks).sort().reverse();
  for (const weekKey of sortedWeeks.slice(0, 20)) {
    const weekCommits = weeks[weekKey];
    const endDate = new Date(weekKey);
    endDate.setDate(endDate.getDate() + 6);
    const endStr = endDate.toISOString().split('T')[0];

    md += `## Week of ${weekKey} to ${endStr}\n\n`;

    // Group by category
    const grouped = {};
    for (const commit of weekCommits) {
      const cat = categorize(commit.message);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(commit);
    }

    for (const [category, catCommits] of Object.entries(grouped)) {
      md += `### ${category}\n`;
      for (const c of catCommits) {
        md += `- ${c.message}\n`;
      }
      md += '\n';
    }
  }

  md += `---\n*Auto-generated by Documentalist Agent on ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

/**
 * Generate ONBOARDING.md — quickstart guide for new developers.
 */
async function generateOnboarding(manifest, runClaudeAgent) {
  const summary = manifest.summary || {};
  const filesByType = summary.byType || {};

  const prompt = `You are a documentation agent for SmartCookBook, a commercial kitchen management app.

TASK: Generate an ONBOARDING.md — a quickstart guide for new developers joining the project.

PROJECT STATS:
- Total files: ${summary.totalFiles || '~290'}
- Total lines: ${summary.totalLines || '~190,000'}
- Components: ${filesByType.component || '?'}, Services: ${filesByType.service || '?'}, Pages: ${filesByType.page || '?'}
- Tech: React 19, Vite 7, Firebase (Firestore + Auth + Functions + Storage)
- Tests: ~1,921 passing across 63 test files (Vitest)

PROJECT STRUCTURE:
- app-new/ — Main frontend (React + Vite)
- functions/ — Firebase Cloud Functions
- scripts/autopilot/ — AI agent automation system
- dashboard/ — Electron Command Center
- docs/ — All documentation
- website/ — Next.js public-facing website

KEY FEATURES:
1. Invoice processing (Vision AI parsing, type detection, handler architecture)
2. Inventory management (par levels, vendor tracking, stock alerts)
3. Recipe management (scaling, cost calculation, method steps)
4. Task/prep list system (dependencies, prerequisite tasks)
5. Voice dictation for hands-free kitchen use
6. Auto-generated public websites (10-step wizard)
7. API credit system (monthly allowance per user)

Generate a comprehensive onboarding guide with:
1. Prerequisites (Node, Firebase CLI, etc.)
2. Quick setup (clone, install, env vars)
3. Architecture overview (keep it simple, 2-3 paragraphs)
4. Key directories and what they contain
5. Development workflow (run dev, run tests, deploy)
6. Common tasks (add a page, add a service, add a test)
7. Where to find things (docs index, key files)
8. Coding conventions summary

Return ONLY the markdown content.`;

  const content = await runClaudeAgent(prompt, { task: 'generate onboarding guide' });
  return stripFences(content);
}

/**
 * Generate RISK_REGISTER.md — technical risks from codebase analysis.
 */
async function generateRiskRegister(manifest, runClaudeAgent) {
  const summary = manifest.summary || {};
  const cycles = manifest.circularDependencies || [];

  // Gather large files as complexity signals
  const largeFiles = Object.entries(manifest.files || {})
    .filter(([, data]) => data.lines > 500)
    .sort(([, a], [, b]) => b.lines - a.lines)
    .slice(0, 15)
    .map(([fp, data]) => `${fp} (${data.lines} lines)`);

  const prompt = `You are a risk analysis agent for SmartCookBook, a commercial kitchen management app.

TASK: Generate a RISK_REGISTER.md documenting technical risks and mitigation strategies.

CODEBASE ANALYSIS:
- Total files: ${summary.totalFiles || '~290'}, Lines: ${summary.totalLines || '~190,000'}
- JSDoc coverage: ${summary.jsdocCoverage || '~57%'}
- Circular dependencies: ${cycles.length}
- Largest files: ${largeFiles.join('; ')}

KNOWN DEPENDENCIES:
- React 19 (pre-release), Vite 7, Firebase Admin SDK
- Anthropic Claude API (invoice parsing, recipe parsing, agent automation)
- IndexedDB (client-side), Firestore (cloud), Firebase Storage
- Quebec tax calculations (TPS/TVQ), Law 25 + PIPEDA compliance needed

Generate a risk register with these sections:
1. **Critical Risks** — Could cause data loss, security breach, or app failure
2. **High Risks** — Could block releases or degrade user experience
3. **Medium Risks** — Technical debt that compounds over time
4. **Low Risks** — Minor issues with easy mitigation

For each risk include:
- **Risk**: Description
- **Impact**: What happens if it materializes
- **Likelihood**: High/Medium/Low
- **Mitigation**: What to do about it
- **Owner**: Who should handle it (dev team, legal, DevOps)

Return ONLY the markdown content.`;

  const content = await runClaudeAgent(prompt, { task: 'generate risk register' });
  return stripFences(content);
}

/**
 * Generate ADRs from git history — scan commits for architectural decisions.
 * Returns array of { title, context, decision, rationale }.
 */
async function extractADRsFromHistory(projectRoot, runClaudeAgent) {
  const commits = getGitHistory(path.join(projectRoot, '..'), 150);
  if (commits.length === 0) return [];

  // Filter to significant commits (skip minor fixes, typos)
  const significant = commits.filter(c => {
    const msg = c.message.toLowerCase();
    return msg.includes('refactor') || msg.includes('architect') || msg.includes('split')
      || msg.includes('create') || msg.includes('migrate') || msg.includes('replace')
      || msg.includes('delete') || msg.includes('remove') || msg.includes('handler')
      || msg.includes('system') || msg.includes('pipeline') || msg.includes('vision')
      || msg.includes('credit') || msg.includes('dependency') || msg.includes('service')
      || msg.length > 60;
  }).slice(0, 50);

  if (significant.length === 0) return [];

  const commitList = significant.map(c => `[${c.date}] ${c.message}`).join('\n');

  const prompt = `You are an architecture analyst for SmartCookBook.

TASK: Analyze these git commits and extract 3-5 key architectural decisions that were made.

GIT HISTORY (significant commits):
${commitList}

For each decision, provide a JSON array with objects containing:
- "title": Short decision title (e.g., "Replace legacy parser with Vision pipeline")
- "date": Approximate date (YYYY-MM-DD)
- "context": 1-2 sentences about the situation that led to this decision
- "decision": 1-2 sentences about what was decided
- "rationale": 1-2 sentences about why this approach was chosen
- "alternatives": 1 sentence about what else was considered
- "consequences_positive": 1 sentence about benefits
- "consequences_negative": 1 sentence about tradeoffs

Return ONLY valid JSON (array of objects). No markdown, no commentary.`;

  try {
    const raw = await runClaudeAgent(prompt, { task: 'extract ADRs from git history' });
    const cleaned = stripFences(raw);
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`  [ADR] Failed to extract ADRs: ${err.message}`);
    return [];
  }
}

/**
 * Format a single ADR as markdown.
 */
function formatADR(number, adr) {
  const paddedNum = String(number).padStart(3, '0');
  const slug = (adr.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

  return {
    filename: `ADR-${paddedNum}-${slug}.md`,
    content: `# ADR-${paddedNum}: ${adr.title}

**Status:** Accepted
**Date:** ${adr.date || new Date().toISOString().split('T')[0]}
**Source:** init (auto-generated from git history)

## Context
${adr.context || 'No context available.'}

## Decision
${adr.decision || 'No decision recorded.'}

## Rationale
${adr.rationale || 'No rationale provided.'}

## Alternatives Considered
${adr.alternatives || 'None documented.'}

## Consequences
- **Positive:** ${adr.consequences_positive || 'Not documented.'}
- **Negative:** ${adr.consequences_negative || 'Not documented.'}

---
*Generated by Documentalist Agent — Init Mode*
`,
  };
}

/**
 * Generate ADR INDEX.md from existing ADR files.
 */
function generateADRIndex(adrs) {
  let md = `# Architecture Decision Records

Index of all architectural decisions for SmartCookBook.

| # | Decision | Date | Status |
|---|----------|------|--------|
`;

  for (const adr of adrs) {
    const paddedNum = String(adr.number).padStart(3, '0');
    md += `| ${paddedNum} | [${adr.title}](${adr.filename}) | ${adr.date || '--'} | Accepted |\n`;
  }

  md += `
## What are ADRs?

Architecture Decision Records capture important technical decisions made during development.
Each ADR documents the context, decision, rationale, and consequences.

See [Michael Nygard's article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) for the format origin.

---
*Auto-generated by Documentalist Agent on ${new Date().toISOString().split('T')[0]}*
`;

  return md;
}

// ══════════════════════════════════════════════════
//  SECTION 8: INIT MODE
// ══════════════════════════════════════════════════

/**
 * Init mode: first-run documentation generation.
 *
 * Steps:
 *   1. Load manifest + coverage
 *   2. Audit existing docs against DOC_REGISTRY — find gaps
 *   3. Generate missing docs: GLOSSARY, CHANGELOG, ONBOARDING, RISK_REGISTER
 *   4. Generate ADRs from git history
 *   5. Create init-report.json with questions for human review
 *   6. Update doc_health.json
 *   7. Return report
 */
async function runInit({ runClaudeAgent, projectRoot, progress }) {
  const report = { changes: [], metrics: {} };

  // ── Step 1: Load data ──
  await progress('loading', 'Loading manifest...', 5);
  console.log('Step 1: Loading manifest + coverage...');

  const manifest = await loadManifest();
  const coverage = await loadCoverage();

  if (!manifest) {
    const msg = 'manifest.json not found — run codebase-mapper first';
    console.error(`  ERROR: ${msg}`);
    report.changes.push(`Skipped: ${msg}`);
    return report;
  }

  console.log(`  Loaded manifest (${Object.keys(manifest.files || {}).length} files)\n`);

  // ── Step 2: Audit existing docs ──
  await progress('auditing', 'Auditing existing documentation...', 10);
  console.log('Step 2: Auditing docs against registry...\n');

  const docAudit = { existing: [], missing: [], gaps: [] };
  const initTargets = ['GLOSSARY.md', 'CHANGELOG.md', 'ONBOARDING.md', 'RISK_REGISTER.md'];

  for (const docName of initTargets) {
    const entry = DOC_REGISTRY[docName];
    if (!entry) continue;

    const content = await readDocFile(entry.path, projectRoot);
    if (content) {
      docAudit.existing.push(docName);
      console.log(`  [Exists] ${docName}`);
    } else {
      docAudit.missing.push(docName);
      console.log(`  [Missing] ${docName} — will generate`);
    }
  }

  // Check ADRs directory
  const adrsDir = path.join(projectRoot, '..', 'docs', 'adrs');
  let adrsExist = false;
  try {
    await fs.access(adrsDir);
    adrsExist = true;
    console.log(`  [Exists] docs/adrs/ directory`);
  } catch {
    console.log(`  [Missing] docs/adrs/ directory — will create`);
  }

  if (docAudit.missing.length === 0 && adrsExist) {
    console.log('\n  All init docs already exist! Running update instead...');
    report.changes.push('Init: all docs already exist — switched to update mode');
    return runUpdate({ runClaudeAgent, projectRoot, progress });
  }

  const totalTasks = docAudit.missing.length + (adrsExist ? 0 : 1);
  let completedTasks = 0;

  // ── Step 3: Generate missing docs ──
  console.log(`\nStep 3: Generating ${docAudit.missing.length} missing doc(s)...\n`);

  const generatedDocs = [];
  const humanQuestions = [];

  for (const docName of docAudit.missing) {
    completedTasks++;
    const pct = 15 + Math.round((completedTasks / totalTasks) * 60);
    await progress('generating', `Generating ${docName}...`, pct);
    console.log(`  Generating ${docName}...`);

    try {
      let content;

      switch (docName) {
        case 'GLOSSARY.md':
          content = await generateGlossary(manifest, runClaudeAgent);
          humanQuestions.push({
            doc: 'GLOSSARY.md',
            question: 'Review generated glossary — add any missing domain terms specific to your business',
            priority: 'medium',
          });
          break;

        case 'CHANGELOG.md':
          content = generateChangelog(projectRoot);
          break;

        case 'ONBOARDING.md':
          content = await generateOnboarding(manifest, runClaudeAgent);
          humanQuestions.push({
            doc: 'ONBOARDING.md',
            question: 'Review onboarding guide — add team-specific setup steps, credentials, and communication channels',
            priority: 'high',
          });
          break;

        case 'RISK_REGISTER.md':
          content = await generateRiskRegister(manifest, runClaudeAgent);
          humanQuestions.push({
            doc: 'RISK_REGISTER.md',
            question: 'Review risk register — adjust likelihood/impact ratings based on business context, add business risks',
            priority: 'high',
          });
          break;

        default:
          console.log(`    [Skip] No generator for ${docName}`);
          continue;
      }

      if (content) {
        const entry = DOC_REGISTRY[docName];
        const fullPath = path.join(projectRoot, '..', entry.path);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content + '\n');
        generatedDocs.push(docName);
        report.changes.push(`Generated ${docName} (${content.split('\n').length} lines)`);
        console.log(`    Written: ${entry.path}`);
      }
    } catch (err) {
      console.error(`    [Error] ${docName}: ${err.message}`);
      report.changes.push(`Failed to generate ${docName}: ${err.message}`);
    }
  }

  // ── Step 4: Generate ADRs ──
  if (!adrsExist) {
    await progress('generating', 'Extracting ADRs from git history...', 78);
    console.log('\nStep 4: Extracting ADRs from git history...\n');

    await fs.mkdir(adrsDir, { recursive: true });

    const adrData = await extractADRsFromHistory(projectRoot, runClaudeAgent);

    if (adrData.length > 0) {
      const adrEntries = [];

      for (let i = 0; i < adrData.length; i++) {
        const adr = adrData[i];
        const number = i + 1;
        const formatted = formatADR(number, adr);

        await fs.writeFile(path.join(adrsDir, formatted.filename), formatted.content);
        adrEntries.push({ number, title: adr.title, date: adr.date, filename: formatted.filename });
        console.log(`    Written: docs/adrs/${formatted.filename}`);
      }

      // Generate INDEX.md
      const indexContent = generateADRIndex(adrEntries);
      await fs.writeFile(path.join(adrsDir, 'INDEX.md'), indexContent);
      console.log(`    Written: docs/adrs/INDEX.md`);

      report.changes.push(`Generated ${adrData.length} ADRs from git history + INDEX.md`);
      generatedDocs.push('adrs/INDEX.md');

      humanQuestions.push({
        doc: 'docs/adrs/',
        question: `Review ${adrData.length} auto-generated ADRs — verify accuracy, add missing context, mark any as "Superseded" if no longer relevant`,
        priority: 'medium',
      });
    } else {
      console.log('    No architectural decisions extracted from git history');
      report.changes.push('ADR extraction found no significant architectural decisions');
    }
  }

  // ── Step 5: Create init-report.json ──
  await progress('report', 'Creating init report...', 88);
  console.log('\nStep 5: Creating init-report.json...');

  const initReport = {
    generatedAt: new Date().toISOString(),
    mode: 'init',
    docsGenerated: generatedDocs,
    docsExisting: docAudit.existing,
    humanReviewNeeded: humanQuestions,
    summary: `Generated ${generatedDocs.length} new doc(s). ${humanQuestions.length} question(s) for human review.`,
  };

  const initReportPath = path.join(projectRoot, '..', 'docs', 'init-report.json');
  await fs.writeFile(initReportPath, JSON.stringify(initReport, null, 2));
  console.log(`  Written: docs/init-report.json`);
  report.changes.push(`Created init-report.json (${humanQuestions.length} items for human review)`);

  // ── Step 6: Update doc_health.json ──
  await progress('health', 'Updating doc health...', 93);
  console.log('\nStep 6: Updating doc_health.json...');

  const fakeUpdated = generatedDocs.map(name => ({ docName: name, updated: true }));
  const health = generateDocHealth(coverage, fakeUpdated);
  await fs.writeFile(HEALTH_PATH, JSON.stringify(health, null, 2));
  report.changes.push(`Updated doc_health.json — ${health.overallHealth}% overall health`);

  // ── Metrics ──
  report.metrics = {
    mode: 'init',
    overallHealth: health.overallHealth,
    totalDocs: health.totalDocs,
    docsGenerated: generatedDocs.length,
    docsExisting: docAudit.existing.length,
    humanReviewItems: humanQuestions.length,
  };

  await progress('complete', `Init complete: ${generatedDocs.length} docs generated`, 100);

  // ── Summary ──
  console.log('\n=== DOCUMENTALIST INIT SUMMARY ===');
  console.log(`Docs generated: ${generatedDocs.length}`);
  console.log(`Docs already exist: ${docAudit.existing.length}`);
  console.log(`Human review items: ${humanQuestions.length}`);
  console.log(`Overall health: ${health.overallHealth}%`);

  if (humanQuestions.length > 0) {
    console.log('\nItems needing human review:');
    for (const q of humanQuestions) {
      console.log(`  [${q.priority.toUpperCase()}] ${q.doc}: ${q.question}`);
    }
  }

  return report;
}

// ══════════════════════════════════════════════════
//  SECTION 9: DIGEST MODE
// ══════════════════════════════════════════════════

/**
 * Extract structured knowledge from a session summary using Claude.
 * Returns { decisions[], codeChanges[], glossaryTerms[], deferredWork[] }.
 */
async function extractSessionKnowledge(summaryText, runClaudeAgent) {
  const prompt = `You are a documentation analyst for SmartCookBook, a commercial kitchen management app.

TASK: Extract structured knowledge from this Claude Code session summary.

SESSION SUMMARY:
${summaryText}

Extract the following categories:

1. DECISIONS: Architectural or design decisions made during the session.
   Each: { "title": "...", "context": "...", "decision": "...", "rationale": "..." }

2. CODE_CHANGES: Files modified with WHY they were changed.
   Each: { "files": ["..."], "description": "...", "category": "feature|fix|refactor|docs" }

3. GLOSSARY_TERMS: Domain terms that were defined, clarified, or used significantly.
   Each: { "term": "...", "definition": "..." }

4. DEFERRED_WORK: Tasks mentioned but not completed during the session.
   Each: { "task": "...", "priority": "high|medium|low" }

Return ONLY valid JSON with this structure:
{
  "decisions": [...],
  "codeChanges": [...],
  "glossaryTerms": [...],
  "deferredWork": [...]
}

If a category has no items, return an empty array. No commentary.`;

  try {
    const raw = await runClaudeAgent(prompt, { task: 'extract session knowledge' });
    const cleaned = stripFences(raw);
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`  [Digest] Failed to extract knowledge: ${err.message}`);
    return { decisions: [], codeChanges: [], glossaryTerms: [], deferredWork: [] };
  }
}

/**
 * Append new terms to an existing GLOSSARY.md file.
 */
async function appendToGlossary(terms, projectRoot) {
  if (!terms || terms.length === 0) return false;

  const glossaryPath = path.join(projectRoot, '..', 'docs', 'GLOSSARY.md');
  let existing = '';
  try {
    existing = await fs.readFile(glossaryPath, 'utf-8');
  } catch {
    existing = '# Glossary\n\nDomain terms and definitions for SmartCookBook.\n\n';
  }

  const existingLower = existing.toLowerCase();
  const newTerms = terms.filter(t => !existingLower.includes(`### ${t.term.toLowerCase()}`));

  if (newTerms.length === 0) return false;

  let appendText = '\n<!-- Added by Documentalist Digest -->\n\n';
  for (const t of newTerms) {
    appendText += `### ${t.term}\n${t.definition}\n\n`;
  }

  await fs.writeFile(glossaryPath, existing.trimEnd() + '\n' + appendText);
  return true;
}

/**
 * Append new entries to CHANGELOG.md.
 */
async function appendToChangelog(changes, projectRoot) {
  if (!changes || changes.length === 0) return false;

  const changelogPath = path.join(projectRoot, '..', 'docs', 'CHANGELOG.md');
  let existing = '';
  try {
    existing = await fs.readFile(changelogPath, 'utf-8');
  } catch {
    existing = '# Changelog\n\nAll notable changes to SmartCookBook.\n\n';
  }

  const today = new Date().toISOString().split('T')[0];
  let entry = `\n## Session Digest — ${today}\n\n`;

  const grouped = {};
  for (const change of changes) {
    const cat = change.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(change);
  }

  for (const [category, items] of Object.entries(grouped)) {
    entry += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
    for (const item of items) {
      const files = item.files?.join(', ') || '';
      entry += `- ${item.description}${files ? ` (${files})` : ''}\n`;
    }
    entry += '\n';
  }

  const insertPoint = existing.indexOf('\n## ');
  if (insertPoint > 0) {
    const updated = existing.slice(0, insertPoint) + entry + existing.slice(insertPoint);
    await fs.writeFile(changelogPath, updated);
  } else {
    await fs.writeFile(changelogPath, existing.trimEnd() + '\n' + entry);
  }

  return true;
}

/**
 * Create new ADRs from extracted decisions.
 */
async function createADRsFromDecisions(decisions, projectRoot) {
  if (!decisions || decisions.length === 0) return 0;

  const adrsDir = path.join(projectRoot, '..', 'docs', 'adrs');
  await fs.mkdir(adrsDir, { recursive: true });

  // Find the highest existing ADR number
  let maxNum = 0;
  try {
    const files = await fs.readdir(adrsDir);
    for (const f of files) {
      const match = f.match(/^ADR-(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    }
  } catch {
    // Directory might not exist yet
  }

  let created = 0;
  for (const decision of decisions) {
    maxNum++;
    const formatted = formatADR(maxNum, {
      title: decision.title,
      date: new Date().toISOString().split('T')[0],
      context: decision.context,
      decision: decision.decision,
      rationale: decision.rationale,
      alternatives: 'Not documented in session.',
      consequences_positive: 'See decision rationale.',
      consequences_negative: 'Not documented in session.',
    });

    await fs.writeFile(path.join(adrsDir, formatted.filename), formatted.content);
    console.log(`    Written: docs/adrs/${formatted.filename}`);
    created++;
  }

  // Regenerate INDEX.md
  if (created > 0) {
    try {
      const allFiles = await fs.readdir(adrsDir);
      const adrEntries = [];
      for (const f of allFiles) {
        const match = f.match(/^ADR-(\d+)-(.+)\.md$/);
        if (match) {
          const num = parseInt(match[1]);
          const title = match[2].replace(/-/g, ' ');
          adrEntries.push({ number: num, title, date: '', filename: f });
        }
      }
      adrEntries.sort((a, b) => a.number - b.number);
      const indexContent = generateADRIndex(adrEntries);
      await fs.writeFile(path.join(adrsDir, 'INDEX.md'), indexContent);
    } catch {
      // Index rebuild failed — not critical
    }
  }

  return created;
}

/**
 * Digest mode: process session summaries into structured documentation.
 *
 * Steps:
 *   1. Read session digests from Firestore queue
 *   2. For each: extract structured knowledge via Claude
 *   3. Route extracted data to appropriate docs
 *   4. Mark queue items as processed
 *   5. Return report
 */
async function runDigest({ runClaudeAgent, projectRoot, progress }) {
  const report = { changes: [], metrics: {} };

  await progress('loading', 'Reading session digests...', 5);
  console.log('Step 1: Reading session digests...\n');

  const queueItems = await readDocQueue();
  const sessionItems = queueItems.filter(item => item.type === 'session-digest');
  const processedIds = [];

  if (sessionItems.length === 0) {
    console.log('  No session digests in queue');
    report.changes.push('No session digests to process');
    report.metrics = { mode: 'digest', sessionsProcessed: 0 };
    await progress('complete', 'No digests to process', 100);
    return report;
  }

  console.log(`  Found ${sessionItems.length} session digest(s)\n`);

  let totalDecisions = 0;
  let totalChanges = 0;
  let totalTerms = 0;
  let totalDeferred = 0;

  for (let i = 0; i < sessionItems.length; i++) {
    const item = sessionItems[i];
    const pct = 10 + Math.round(((i + 1) / sessionItems.length) * 70);
    await progress('extracting', `Processing digest ${i + 1}/${sessionItems.length}...`, pct);

    const summaryText = item.sessionData?.summary || '';
    if (!summaryText) {
      console.log(`  [Skip] Empty session summary (queue item ${item.id})`);
      processedIds.push(item.id);
      continue;
    }

    console.log(`  Processing digest from ${item.sourceAgent || 'unknown'}...`);

    const knowledge = await extractSessionKnowledge(summaryText, runClaudeAgent);

    // Route: Decisions → ADRs
    if (knowledge.decisions.length > 0) {
      const created = await createADRsFromDecisions(knowledge.decisions, projectRoot);
      totalDecisions += created;
      report.changes.push(`Created ${created} ADR(s) from session decisions`);
    }

    // Route: Code changes → CHANGELOG
    if (knowledge.codeChanges.length > 0) {
      const updated = await appendToChangelog(knowledge.codeChanges, projectRoot);
      if (updated) {
        totalChanges += knowledge.codeChanges.length;
        report.changes.push(`Appended ${knowledge.codeChanges.length} change(s) to CHANGELOG.md`);
      }
    }

    // Route: Glossary terms → GLOSSARY
    if (knowledge.glossaryTerms.length > 0) {
      const updated = await appendToGlossary(knowledge.glossaryTerms, projectRoot);
      if (updated) {
        totalTerms += knowledge.glossaryTerms.length;
        report.changes.push(`Added ${knowledge.glossaryTerms.length} term(s) to GLOSSARY.md`);
      }
    }

    // Route: Deferred work → log only
    if (knowledge.deferredWork.length > 0) {
      totalDeferred += knowledge.deferredWork.length;
      console.log(`    Deferred work items: ${knowledge.deferredWork.length}`);
      for (const dw of knowledge.deferredWork) {
        console.log(`      [${dw.priority}] ${dw.task}`);
      }
    }

    processedIds.push(item.id);
  }

  // Mark queue items as processed
  await progress('cleanup', 'Marking digests as processed...', 85);
  await markQueueProcessed(processedIds);

  report.metrics = {
    mode: 'digest',
    sessionsProcessed: sessionItems.length,
    adrsCreated: totalDecisions,
    changelogEntries: totalChanges,
    glossaryTerms: totalTerms,
    deferredWork: totalDeferred,
  };

  await progress('complete', `Processed ${sessionItems.length} digest(s)`, 100);

  console.log('\n=== DOCUMENTALIST DIGEST SUMMARY ===');
  console.log(`Sessions processed: ${sessionItems.length}`);
  console.log(`ADRs created: ${totalDecisions}`);
  console.log(`Changelog entries: ${totalChanges}`);
  console.log(`Glossary terms: ${totalTerms}`);
  console.log(`Deferred work: ${totalDeferred}`);

  return report;
}

// ══════════════════════════════════════════════════
//  SECTION 10: REVIEW MODE — AI-Assisted Interactive Doc Review
// ══════════════════════════════════════════════════

/**
 * Review mode entry point.
 * Phase 1: If no doc_reviews exist → analyze docs and generate questions.
 * Phase 2: If answered reviews exist → apply corrections to docs.
 * Waiting: If pending (unanswered) reviews exist → report and exit.
 */
async function runReview({ runClaudeAgent, projectRoot, progress }) {
  const report = { changes: [], metrics: {}, errors: [] };

  await progress('loading', 'Checking review status...', 5);

  const db = getDB();
  if (!db) {
    report.changes.push('Firestore not available — cannot run review mode');
    report.errors.push('No Firestore connection');
    return report;
  }

  // Check existing review state
  let pendingSnap, answeredSnap;
  try {
    pendingSnap = await db.collection('doc_reviews')
      .where('status', '==', 'pending').get();
    answeredSnap = await db.collection('doc_reviews')
      .where('status', '==', 'answered').get();
  } catch (err) {
    report.errors.push(`Firestore query failed: ${err.message}`);
    return report;
  }

  // Phase 2: Apply answers if any are ready
  if (answeredSnap.size > 0) {
    console.log(`\n  Found ${answeredSnap.size} answered review(s) — applying corrections...\n`);
    return runReviewApply({ runClaudeAgent, projectRoot, progress, answeredDocs: answeredSnap.docs, db, report });
  }

  // Waiting: questions generated but not yet answered
  if (pendingSnap.size > 0) {
    const totalQs = pendingSnap.docs.reduce((sum, d) => sum + (d.data().questions || []).length, 0);
    report.changes.push(`Waiting for user to answer ${totalQs} question(s) across ${pendingSnap.size} doc(s) in dashboard`);
    report.metrics = { mode: 'review', phase: 'waiting', pendingReviews: pendingSnap.size, pendingQuestions: totalQs };
    await progress('complete', `${pendingSnap.size} review(s) awaiting answers in dashboard`, 100);
    return report;
  }

  // Phase 1: Analyze docs and generate questions
  console.log('\n  No existing reviews — analyzing docs for gaps...\n');
  return runReviewAnalyze({ runClaudeAgent, projectRoot, progress, db, report });
}

/**
 * Phase 1: Read each doc flagged for review, ask Claude to find specific gaps,
 * store targeted questions in Firestore doc_reviews collection.
 */
async function runReviewAnalyze({ runClaudeAgent, projectRoot, progress, db, report }) {
  await progress('loading', 'Loading init-report.json...', 10);

  const initReportPath = path.join(projectRoot, '..', 'docs', 'init-report.json');
  const initReport = await loadJSON(initReportPath);

  if (!initReport || !initReport.humanReviewNeeded || initReport.humanReviewNeeded.length === 0) {
    report.changes.push('No docs flagged for review in init-report.json');
    await progress('complete', 'No reviews needed', 100);
    return report;
  }

  const reviewItems = initReport.humanReviewNeeded;
  let totalQuestions = 0;

  for (let i = 0; i < reviewItems.length; i++) {
    const item = reviewItems[i];
    const pct = 15 + Math.round(((i + 1) / reviewItems.length) * 70);
    await progress('analyzing', `Analyzing ${item.doc}...`, pct);
    console.log(`  Analyzing: ${item.doc}`);

    // Read doc content
    let docContent;
    let docPath;

    if (item.doc.endsWith('/')) {
      // Directory (ADRs) — concatenate all files
      docContent = await readADRsForReview(projectRoot);
      docPath = item.doc;
    } else {
      // Look up in DOC_REGISTRY first, fallback to docs/ prefix
      const regKey = Object.keys(DOC_REGISTRY).find(k =>
        k === item.doc || DOC_REGISTRY[k].path.endsWith(item.doc)
      );
      const entry = regKey ? DOC_REGISTRY[regKey] : null;
      docPath = entry ? entry.path : `docs/${item.doc}`;
      docContent = await readDocFile(docPath, projectRoot);
    }

    if (!docContent) {
      console.log(`    Skipped: file not found (${docPath})`);
      report.changes.push(`Skipped ${item.doc}: file not found`);
      continue;
    }

    // Ask Claude to find specific gaps
    const questions = await analyzeDocForGaps(item.doc, docContent, runClaudeAgent);

    if (questions.length > 0) {
      await db.collection('doc_reviews').add({
        docName: item.doc,
        docPath,
        priority: item.priority,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        questions: questions.map((q, idx) => ({ ...q, id: `q${idx + 1}`, answer: null })),
        appliedAt: null,
        linesChanged: 0,
      });

      totalQuestions += questions.length;
      console.log(`    Generated ${questions.length} question(s)`);
      report.changes.push(`Generated ${questions.length} question(s) for ${item.doc}`);
    } else {
      console.log(`    No gaps found`);
    }
  }

  report.metrics = {
    mode: 'review',
    phase: 'analyze',
    docsAnalyzed: reviewItems.length,
    questionsGenerated: totalQuestions,
  };
  report.changedFiles = [];

  await progress('complete', `Generated ${totalQuestions} questions for ${reviewItems.length} docs`, 100);

  console.log('\n=== REVIEW ANALYZE SUMMARY ===');
  console.log(`Docs analyzed: ${reviewItems.length}`);
  console.log(`Questions generated: ${totalQuestions}`);
  console.log('User should now answer questions in the Command Center dashboard.\n');

  return report;
}

/**
 * Concatenate all ADR files for bulk review analysis.
 */
async function readADRsForReview(projectRoot) {
  const adrsDir = path.join(projectRoot, '..', 'docs', 'adrs');
  try {
    const files = await fs.readdir(adrsDir);
    const adrFiles = files.filter(f => f.startsWith('ADR-') && f.endsWith('.md')).sort();
    let combined = '';
    for (const f of adrFiles) {
      const content = await fs.readFile(path.join(adrsDir, f), 'utf-8');
      combined += `\n=== ${f} ===\n${content}\n`;
    }
    return combined;
  } catch {
    return null;
  }
}

/**
 * Core gap detection: send doc to Claude with project facts, get specific questions back.
 */
async function analyzeDocForGaps(docName, docContent, runClaudeAgent) {
  const prompt = `You are a documentation quality auditor for SmartCookBook, a commercial kitchen management app built in Montreal, Quebec.

PROJECT FACTS (use these to detect inaccuracies):
- Tech stack: React 19 (stable release), Vite 7, Firebase (Firestore + Auth + Functions + Storage)
- All components use .jsx extension (NOT .tsx/.ts — this is a JavaScript project)
- Git repo: https://github.com/mageroyer/kitchenvoice-beta
- App entry point: app-new/src/App.jsx (NOT App.tsx)
- Tests: Vitest framework, ~1,921 tests across 63 test files (NOT Jest)
- No Storybook is used in this project
- No TypeScript is used — all files are .js/.jsx
- This is a solo developer project (owner: Mage Royer, mageroyer@hotmail.com)
- There is NO Slack channel, NO team standups, NO separate teams
- Address: 4640 rue Adam, Montreal, QC H1V 1V3
- Docs directory structure: docs/architecture/, docs/guides/, docs/legal/, docs/status/, docs/adrs/
- Key doc paths: docs/architecture/API_REFERENCE.md, docs/architecture/SYSTEM_ARCHITECTURE.md
- "Handler" in this codebase means invoice type processor (foodSupplyHandler, packagingHandler, etc.), NOT a person
- Quebec taxes: TPS (5%) / TVQ (9.975%)
- API credit system: 50 credits/month per user, owner bypass for unlimited
- The app has a custom voice dictation system for hands-free kitchen use
- Public website builder generates Next.js sites deployed on Vercel
- "Slug" means URL path for public website (e.g., /my-store)
- No separate UX team, DevOps team, Architecture team, Legal team, or Security Consultant exists

TASK: Analyze this document and find ALL specific issues that need human input or correction.

DOCUMENT NAME: ${docName}
\`\`\`
${docContent}
\`\`\`

Find these issue types:
1. PLACEHOLDER — Template values like <repository-url>, TODO, TBD, or generic placeholder text
2. INCORRECT_REF — Wrong file paths, wrong extensions (.tsx instead of .jsx), references to non-existent files or directories
3. MISSING_INFO — Information gaps that only the project owner can fill (though many can be filled using the PROJECT FACTS above)
4. OUTDATED — Facts that may have been true when generated but conflict with the PROJECT FACTS
5. INACCURATE — Definitions or descriptions that are factually wrong based on the PROJECT FACTS

For each issue found, return a JSON object:
{
  "lineRef": "approximate line number or section heading",
  "category": "placeholder" | "incorrect_ref" | "missing_info" | "outdated" | "inaccurate",
  "question": "A SPECIFIC question for the user, including the current wrong value in quotes",
  "currentValue": "the exact text that is wrong or missing",
  "suggestion": "your best correction based on PROJECT FACTS, or null if you cannot guess"
}

Return ONLY a JSON array. No commentary before or after. If no issues found, return [].`;

  try {
    const raw = await runClaudeAgent(prompt, { task: `analyze ${docName} for review gaps` });
    const cleaned = stripFences(raw);
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`  [Review] Failed to analyze ${docName}: ${err.message}`);
    return [];
  }
}

/**
 * Phase 2: Read answered questions from Firestore, load each doc,
 * send doc + answers to Claude for merging, write updated files.
 */
async function runReviewApply({ runClaudeAgent, projectRoot, progress, answeredDocs, db, report }) {
  let totalApplied = 0;

  for (let i = 0; i < answeredDocs.length; i++) {
    const docSnap = answeredDocs[i];
    const review = docSnap.data();
    const pct = 10 + Math.round(((i + 1) / answeredDocs.length) * 75);
    await progress('applying', `Applying answers to ${review.docName}...`, pct);
    console.log(`  Applying corrections to: ${review.docName}`);

    // ADR directory — skip auto-apply, mark done
    if (review.docPath.endsWith('/')) {
      await docSnap.ref.update({
        status: 'applied',
        appliedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      report.changes.push(`Marked ADR review as applied (manual review only)`);
      totalApplied++;
      continue;
    }

    // Load current doc content
    const currentContent = await readDocFile(review.docPath, projectRoot);
    if (!currentContent) {
      report.changes.push(`Skipped ${review.docName}: file not found`);
      continue;
    }

    // Build Q&A pairs from answered questions
    const answeredQuestions = (review.questions || []).filter(q => q.answer && q.answer.trim());
    if (answeredQuestions.length === 0) {
      await docSnap.ref.update({ status: 'applied', updatedAt: FieldValue.serverTimestamp() });
      continue;
    }

    const qaText = answeredQuestions.map(q =>
      `ISSUE (${q.category}, near line ${q.lineRef}): ${q.question}\nCURRENT VALUE: "${q.currentValue}"\nCORRECTION: ${q.answer}`
    ).join('\n\n');

    const applyPrompt = `You are a documentation editor for SmartCookBook.

TASK: Apply the following corrections to this document. The project owner has answered specific questions about issues found during review.

CURRENT DOCUMENT (${review.docName}):
\`\`\`
${currentContent}
\`\`\`

CORRECTIONS TO APPLY:
${qaText}

RULES:
1. Apply each correction precisely where indicated
2. Preserve ALL other content exactly as-is (do not rewrite sections that have no corrections)
3. Maintain the document's formatting, headings, and style
4. If a correction says "remove" or "delete", remove that section/line cleanly
5. If a correction provides new content, integrate it naturally into the existing structure
6. Do NOT add new sections, commentary, or "Updated by" notes
7. Return the COMPLETE updated document — every line, updated or not

Return ONLY the updated markdown content. No code fences, no commentary.`;

    try {
      const updated = await runClaudeAgent(applyPrompt, { task: `apply review corrections to ${review.docName}` });
      const cleaned = stripFences(updated);

      // Write updated doc
      const fullPath = path.join(projectRoot, '..', review.docPath);
      await fs.writeFile(fullPath, cleaned.endsWith('\n') ? cleaned : cleaned + '\n');

      // Mark as applied in Firestore
      await docSnap.ref.update({
        status: 'applied',
        appliedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        linesChanged: Math.abs(cleaned.split('\n').length - currentContent.split('\n').length),
      });

      totalApplied++;
      console.log(`    Applied ${answeredQuestions.length} correction(s)`);
      report.changes.push(`Applied ${answeredQuestions.length} correction(s) to ${review.docName}`);
      if (!report.changedFiles) report.changedFiles = [];
      report.changedFiles.push(review.docPath);
    } catch (err) {
      console.error(`    Failed: ${err.message}`);
      report.changes.push(`Failed to apply corrections to ${review.docName}: ${err.message}`);
      report.errors.push(`Apply failed for ${review.docName}: ${err.message}`);
    }
  }

  report.metrics = { mode: 'review', phase: 'apply', docsApplied: totalApplied };
  await progress('complete', `Applied corrections to ${totalApplied} doc(s)`, 100);

  console.log('\n=== REVIEW APPLY SUMMARY ===');
  console.log(`Docs updated: ${totalApplied}`);

  return report;
}
