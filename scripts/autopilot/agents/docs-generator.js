/**
 * Documentation Generator Agent
 *
 * Automatically updates documentation:
 * 1. Add JSDoc to undocumented functions
 * 2. Update README files
 * 3. Generate changelog from commits
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

export async function run({ runTests, runCommand, projectRoot }) {
  const report = {
    changes: [],
    documented: [],
    skipped: [],
  };

  console.log('Starting documentation generation...\n');

  // 1. Find files with undocumented exports
  console.log('1. Finding undocumented functions...');
  const undocumented = await findUndocumentedFunctions(projectRoot);
  console.log(`Found ${undocumented.length} undocumented functions\n`);

  // 2. Generate JSDoc for undocumented functions (limit to 10 per run)
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  for (const item of undocumented.slice(0, 10)) {
    console.log(`Documenting: ${item.file}::${item.name}`);

    try {
      const fileContent = await fs.readFile(item.fullPath, 'utf-8');

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Add JSDoc documentation to this function. Only output the JSDoc comment block, nothing else.

Function:
\`\`\`javascript
${item.code}
\`\`\`

Context from file:
${fileContent.substring(0, 500)}...

Generate a concise JSDoc comment with:
- Brief description
- @param for each parameter with type and description
- @returns if applicable
- @throws if applicable
- @example if helpful

Output only the JSDoc comment block starting with /** and ending with */`
        }],
      });

      const jsdoc = response.content[0].text.trim();

      // Validate it looks like JSDoc
      if (jsdoc.startsWith('/**') && jsdoc.endsWith('*/')) {
        // Insert JSDoc before the function
        const updatedContent = fileContent.replace(
          item.code,
          `${jsdoc}\n${item.code}`
        );

        await fs.writeFile(item.fullPath, updatedContent);
        report.documented.push(`${item.file}::${item.name}`);
        report.changes.push(`Added JSDoc to ${item.name} in ${item.file}`);
        console.log(`  ✓ Added JSDoc`);
      } else {
        console.log(`  ✗ Invalid JSDoc format`);
        report.skipped.push({ file: item.file, name: item.name, reason: 'Invalid format' });
      }

    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      report.skipped.push({ file: item.file, name: item.name, reason: error.message });
    }
  }

  // 3. Update TODO.md if it exists
  console.log('\n2. Updating TODO.md...');
  await updateTodoMd(projectRoot, report);

  // 4. Verify tests still pass
  if (report.changes.length > 0) {
    console.log('\n3. Verifying tests...');
    const testResult = await runTests();
    if (!testResult.success) {
      console.log('⚠️ Tests failed after documentation changes');
      report.changes.push('Warning: Tests may have been affected');
    }
  }

  // Summary
  console.log('\n=== DOCUMENTATION SUMMARY ===');
  console.log(`Functions documented: ${report.documented.length}`);
  console.log(`Skipped: ${report.skipped.length}`);

  return report;
}

/**
 * Find exported functions without JSDoc
 */
async function findUndocumentedFunctions(projectRoot) {
  const undocumented = [];
  const srcDir = path.join(projectRoot, 'src', 'services');

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
          const relativePath = path.relative(projectRoot, fullPath);

          // Find exported functions without preceding JSDoc
          const functionPatterns = [
            // export function name
            /(?<!\/\*\*[\s\S]*?\*\/\s*)export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
            // export const name = function
            /(?<!\/\*\*[\s\S]*?\*\/\s*)export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
            // export const name = async function
            /(?<!\/\*\*[\s\S]*?\*\/\s*)export\s+const\s+(\w+)\s*=\s*async\s+function/g,
          ];

          for (const pattern of functionPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              const functionName = match[1];
              const startIndex = match.index;

              // Check if there's a JSDoc comment before this
              const before = content.substring(Math.max(0, startIndex - 200), startIndex);
              if (!before.includes('*/')) {
                // Extract the function code (first 200 chars)
                const code = content.substring(startIndex, startIndex + 200);

                undocumented.push({
                  file: relativePath,
                  fullPath,
                  name: functionName,
                  code: match[0] + code.substring(match[0].length, code.indexOf('\n', match[0].length) + 50),
                });
              }
            }
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  await scanDir(srcDir);
  return undocumented;
}

/**
 * Update TODO.md with completion status
 */
async function updateTodoMd(projectRoot, report) {
  const todoPath = path.join(projectRoot, '..', 'docs', 'TODO.md');

  try {
    const content = await fs.readFile(todoPath, 'utf-8');

    // Update last updated date
    const today = new Date().toISOString().split('T')[0];
    const updatedContent = content.replace(
      /\*\*Last Updated:\*\* [\d-]+/,
      `**Last Updated:** ${today}`
    );

    if (updatedContent !== content) {
      await fs.writeFile(todoPath, updatedContent);
      report.changes.push('Updated TODO.md timestamp');
      console.log('  ✓ Updated TODO.md');
    }
  } catch (e) {
    console.log('  ✗ Could not update TODO.md:', e.message);
  }
}
