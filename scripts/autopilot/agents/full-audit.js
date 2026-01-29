/**
 * Full Codebase Audit Agent
 *
 * Monthly comprehensive audit:
 * 1. Code quality analysis
 * 2. Architecture review
 * 3. Performance analysis
 * 4. Technical debt assessment
 * 5. Dependency health
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

export async function run({ runTests, runCommand, projectRoot }) {
  const report = {
    changes: [],
    metrics: {},
    recommendations: [],
  };

  console.log('Starting full codebase audit...\n');
  console.log('This is a read-only analysis - no changes will be made.\n');

  // 1. Collect metrics
  console.log('1. Collecting metrics...');

  // Line counts
  const locResult = await runCommand(`find src -name "*.js" -o -name "*.jsx" | xargs wc -l 2>/dev/null | tail -1 || echo "0 total"`);
  report.metrics.linesOfCode = locResult.stdout?.match(/(\d+)/)?.[1] || 'N/A';

  // File counts
  const fileResult = await runCommand(`find src -name "*.js" -o -name "*.jsx" | wc -l`);
  report.metrics.sourceFiles = fileResult.stdout?.trim() || 'N/A';

  // Test count
  const testResult = await runTests();
  report.metrics.tests = {
    total: testResult.passing + testResult.failing,
    passing: testResult.passing,
    failing: testResult.failing,
  };

  // Dependency count
  const depsResult = await runCommand(`npm ls --depth=0 --json 2>/dev/null || echo "{}"`);
  try {
    const deps = JSON.parse(depsResult.stdout || '{}');
    report.metrics.dependencies = Object.keys(deps.dependencies || {}).length;
  } catch (e) {
    report.metrics.dependencies = 'N/A';
  }

  // 2. Code quality analysis
  console.log('\n2. Analyzing code quality...');

  // ESLint summary
  const lintResult = await runCommand('npm run lint -- --format json 2>/dev/null || echo "[]"');
  try {
    const lintData = JSON.parse(lintResult.stdout || '[]');
    const errors = lintData.reduce((sum, f) => sum + f.errorCount, 0);
    const warnings = lintData.reduce((sum, f) => sum + f.warningCount, 0);
    report.metrics.lint = { errors, warnings };
  } catch (e) {
    report.metrics.lint = { errors: 'N/A', warnings: 'N/A' };
  }

  // 3. Find large files (potential refactoring candidates)
  console.log('\n3. Finding large files...');
  const largeFiles = await findLargeFiles(projectRoot);
  report.metrics.largeFiles = largeFiles;

  if (largeFiles.length > 0) {
    report.recommendations.push({
      type: 'refactoring',
      priority: 'medium',
      title: 'Consider splitting large files',
      details: largeFiles.map(f => `${f.file}: ${f.lines} lines`),
    });
  }

  // 4. Find TODO/FIXME comments
  console.log('\n4. Finding TODO/FIXME comments...');
  const todos = await findTodos(projectRoot);
  report.metrics.todos = todos.length;

  if (todos.length > 10) {
    report.recommendations.push({
      type: 'maintenance',
      priority: 'low',
      title: `${todos.length} TODO/FIXME comments in codebase`,
      details: todos.slice(0, 5).map(t => `${t.file}:${t.line}: ${t.text}`),
    });
  }

  // 5. Check for duplicate code patterns
  console.log('\n5. Analyzing code patterns...');
  const patterns = await analyzePatterns(projectRoot);
  report.metrics.patterns = patterns;

  // 6. Dependency health
  console.log('\n6. Checking dependency health...');
  const outdatedResult = await runCommand('npm outdated --json 2>/dev/null || echo "{}"');
  try {
    const outdated = JSON.parse(outdatedResult.stdout || '{}');
    const count = Object.keys(outdated).length;
    report.metrics.outdatedDeps = count;

    if (count > 10) {
      report.recommendations.push({
        type: 'dependencies',
        priority: 'medium',
        title: `${count} outdated dependencies`,
        details: Object.keys(outdated).slice(0, 5),
      });
    }
  } catch (e) {
    report.metrics.outdatedDeps = 'N/A';
  }

  // 7. Security audit
  console.log('\n7. Security audit...');
  const auditResult = await runCommand('npm audit --json 2>/dev/null || echo "{}"');
  try {
    const audit = JSON.parse(auditResult.stdout || '{}');
    report.metrics.vulnerabilities = audit.metadata?.vulnerabilities || {};

    if (audit.metadata?.vulnerabilities?.critical > 0) {
      report.recommendations.push({
        type: 'security',
        priority: 'critical',
        title: `${audit.metadata.vulnerabilities.critical} critical vulnerabilities`,
        details: ['Run npm audit fix or update affected packages'],
      });
    }
  } catch (e) {
    report.metrics.vulnerabilities = 'N/A';
  }

  // 8. Generate AI summary
  console.log('\n8. Generating AI summary...');
  const summary = await generateAISummary(report);
  report.aiSummary = summary;

  // Final report
  console.log('\n' + '='.repeat(60));
  console.log('FULL CODEBASE AUDIT REPORT');
  console.log('='.repeat(60));
  console.log('\nMETRICS:');
  console.log(`  Lines of Code: ${report.metrics.linesOfCode}`);
  console.log(`  Source Files: ${report.metrics.sourceFiles}`);
  console.log(`  Tests: ${report.metrics.tests.passing}/${report.metrics.tests.total} passing`);
  console.log(`  Dependencies: ${report.metrics.dependencies}`);
  console.log(`  Lint Errors: ${report.metrics.lint.errors}`);
  console.log(`  TODOs/FIXMEs: ${report.metrics.todos}`);
  console.log(`  Outdated Deps: ${report.metrics.outdatedDeps}`);

  console.log('\nRECOMMENDATIONS:');
  report.recommendations.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.priority.toUpperCase()}] ${r.title}`);
    r.details.slice(0, 3).forEach(d => console.log(`     - ${d}`));
  });

  console.log('\nAI SUMMARY:');
  console.log(report.aiSummary);

  return report;
}

/**
 * Find files over 500 lines
 */
async function findLargeFiles(projectRoot) {
  const largeFiles = [];
  const srcDir = path.join(projectRoot, 'src');

  async function scanDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n').length;

          if (lines > 500) {
            largeFiles.push({
              file: path.relative(projectRoot, fullPath),
              lines,
            });
          }
        } catch (e) {
          // Skip
        }
      }
    }
  }

  await scanDir(srcDir);
  return largeFiles.sort((a, b) => b.lines - a.lines).slice(0, 10);
}

/**
 * Find TODO/FIXME comments
 */
async function findTodos(projectRoot) {
  const todos = [];
  const srcDir = path.join(projectRoot, 'src');

  async function scanDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, i) => {
            if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
              todos.push({
                file: path.relative(projectRoot, fullPath),
                line: i + 1,
                text: line.trim().substring(0, 100),
              });
            }
          });
        } catch (e) {
          // Skip
        }
      }
    }
  }

  await scanDir(srcDir);
  return todos;
}

/**
 * Analyze code patterns
 */
async function analyzePatterns(projectRoot) {
  return {
    // Placeholder for pattern analysis
    // Could use tools like jscpd for duplicate detection
    analyzed: true,
    note: 'Pattern analysis requires additional tooling',
  };
}

/**
 * Generate AI summary of the audit
 */
async function generateAISummary(report) {
  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Summarize this codebase audit in 2-3 paragraphs. Focus on overall health, key concerns, and priorities.

Metrics:
${JSON.stringify(report.metrics, null, 2)}

Recommendations:
${JSON.stringify(report.recommendations, null, 2)}

Be concise and actionable.`
      }],
    });

    return response.content[0].text;
  } catch (e) {
    return 'AI summary unavailable: ' + e.message;
  }
}
