/**
 * Test Fixer Agent
 *
 * Automatically fixes failing tests:
 * 1. Run tests to find failures
 * 2. Analyze failure reasons
 * 3. Fix the test or the code
 * 4. Verify fix works
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

export async function run({ runTests, runCommand, projectRoot }) {
  const report = {
    changes: [],
    fixes: [],
    unfixable: [],
  };

  console.log('Running tests to find failures...\n');

  // 1. Run tests and capture output
  const testResult = await runCommand('npm test -- --reporter=json 2>&1 || true');

  if (testResult.success) {
    console.log('All tests passing! Nothing to fix.');
    return report;
  }

  // 2. Parse test failures
  const failures = parseTestFailures(testResult.stdout);
  console.log(`Found ${failures.length} failing tests\n`);

  if (failures.length === 0) {
    console.log('Could not parse test failures');
    return report;
  }

  // 3. Analyze and fix each failure (up to 5 at a time)
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  for (const failure of failures.slice(0, 5)) {
    console.log(`\nAnalyzing: ${failure.testName}`);
    console.log(`File: ${failure.file}`);
    console.log(`Error: ${failure.error.substring(0, 200)}...`);

    try {
      // Read the test file
      const testFilePath = path.join(projectRoot, failure.file);
      const testContent = await fs.readFile(testFilePath, 'utf-8');

      // Read the source file if identifiable
      let sourceContent = '';
      const sourceFile = inferSourceFile(failure.file);
      if (sourceFile) {
        try {
          const sourcePath = path.join(projectRoot, sourceFile);
          sourceContent = await fs.readFile(sourcePath, 'utf-8');
        } catch (e) {
          // Source file not found, continue without it
        }
      }

      // Ask Claude to analyze and fix
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a test fixing expert. Analyze the failing test and provide a fix.
Output format:
1. ANALYSIS: Brief explanation of why the test fails
2. FIX_TYPE: "test" or "source" (which file needs fixing)
3. FILE_PATH: Relative path to the file to fix
4. CHANGES: The exact changes needed (show before/after)
5. CONFIDENCE: high/medium/low

Only suggest fixes you're confident about. If unsure, say CONFIDENCE: low.`,
        messages: [{
          role: 'user',
          content: `Test failure:
File: ${failure.file}
Test: ${failure.testName}
Error: ${failure.error}

Test file content:
\`\`\`javascript
${testContent}
\`\`\`

${sourceContent ? `Source file (${sourceFile}):
\`\`\`javascript
${sourceContent}
\`\`\`` : 'Source file not available'}

Analyze and provide a fix.`
        }],
      });

      const analysis = response.content[0].text;
      console.log('\nAnalysis:', analysis.substring(0, 500));

      // Parse the fix suggestion
      const fix = parseFix(analysis);

      if (fix && fix.confidence !== 'low') {
        // Apply the fix
        const applied = await applyFix(projectRoot, fix);
        if (applied) {
          report.changes.push(`Fixed: ${failure.testName}`);
          report.fixes.push({
            test: failure.testName,
            file: fix.filePath,
            type: fix.type,
          });
        }
      } else {
        report.unfixable.push({
          test: failure.testName,
          reason: fix?.confidence === 'low' ? 'Low confidence fix' : 'Could not determine fix',
        });
      }

    } catch (error) {
      console.error(`Error analyzing ${failure.testName}:`, error.message);
      report.unfixable.push({
        test: failure.testName,
        reason: error.message,
      });
    }
  }

  // 4. Verify fixes
  if (report.fixes.length > 0) {
    console.log('\nVerifying fixes...');
    const verifyResult = await runTests();
    console.log(`After fixes: ${verifyResult.passing} passing, ${verifyResult.failing} failing`);
  }

  return report;
}

/**
 * Parse test failures from output
 */
function parseTestFailures(output) {
  const failures = [];

  // Match Vitest failure pattern
  const failureRegex = /FAIL\s+(.+?)\s*\n.*?✕\s+(.+?)\s*\n([\s\S]*?)(?=(?:FAIL|PASS|\n\n|$))/g;
  let match;

  while ((match = failureRegex.exec(output)) !== null) {
    failures.push({
      file: match[1].trim(),
      testName: match[2].trim(),
      error: match[3].trim(),
    });
  }

  // Fallback: simpler pattern
  if (failures.length === 0) {
    const simpleRegex = /✕\s+(.+?)(?:\s+\((\d+)\s*ms\))?/g;
    while ((match = simpleRegex.exec(output)) !== null) {
      failures.push({
        file: 'unknown',
        testName: match[1].trim(),
        error: 'See test output for details',
      });
    }
  }

  return failures;
}

/**
 * Infer source file from test file path
 */
function inferSourceFile(testFile) {
  // Convert test path to source path
  // e.g., src/__tests__/services/recipeDB.test.js -> src/services/database/recipeDB.js
  const patterns = [
    { from: /__tests__\//, to: '' },
    { from: /\.test\.js$/, to: '.js' },
    { from: /\.test\.jsx$/, to: '.jsx' },
    { from: /\.spec\.js$/, to: '.js' },
  ];

  let sourcePath = testFile;
  for (const pattern of patterns) {
    sourcePath = sourcePath.replace(pattern.from, pattern.to);
  }

  return sourcePath !== testFile ? sourcePath : null;
}

/**
 * Parse fix from Claude's response
 */
function parseFix(analysis) {
  const typeMatch = analysis.match(/FIX_TYPE:\s*(test|source)/i);
  const pathMatch = analysis.match(/FILE_PATH:\s*(.+?)(?:\n|$)/i);
  const confidenceMatch = analysis.match(/CONFIDENCE:\s*(high|medium|low)/i);

  // Extract changes (before/after blocks)
  const changesMatch = analysis.match(/CHANGES:([\s\S]*?)(?=CONFIDENCE:|$)/i);

  if (!typeMatch || !pathMatch) {
    return null;
  }

  return {
    type: typeMatch[1].toLowerCase(),
    filePath: pathMatch[1].trim(),
    confidence: confidenceMatch ? confidenceMatch[1].toLowerCase() : 'medium',
    changes: changesMatch ? changesMatch[1].trim() : '',
  };
}

/**
 * Apply fix to file
 */
async function applyFix(projectRoot, fix) {
  // For safety, we only apply high-confidence fixes
  if (fix.confidence !== 'high') {
    console.log(`Skipping ${fix.confidence} confidence fix`);
    return false;
  }

  // Parse before/after from changes
  const beforeMatch = fix.changes.match(/Before:\s*```[\w]*\n([\s\S]*?)```/i);
  const afterMatch = fix.changes.match(/After:\s*```[\w]*\n([\s\S]*?)```/i);

  if (!beforeMatch || !afterMatch) {
    console.log('Could not parse before/after changes');
    return false;
  }

  const before = beforeMatch[1].trim();
  const after = afterMatch[1].trim();

  try {
    const filePath = path.join(projectRoot, fix.filePath);
    let content = await fs.readFile(filePath, 'utf-8');

    if (!content.includes(before)) {
      console.log('Could not find "before" text in file');
      return false;
    }

    content = content.replace(before, after);
    await fs.writeFile(filePath, content);

    console.log(`Applied fix to ${fix.filePath}`);
    return true;

  } catch (error) {
    console.error(`Error applying fix: ${error.message}`);
    return false;
  }
}
