/**
 * Documentation Generator Agent
 *
 * Automatically updates documentation:
 * 1. Add JSDoc to undocumented functions and components
 * 2. Scans all of src/ (services, components, pages, hooks, utils)
 * 3. Prioritizes most-imported files first (highest impact)
 * 4. For components: generates @component, @param for each PropTypes key
 * 5. Update README files
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

// Limit per run — increased from 10 to 25 for broader coverage
const DOCS_PER_RUN = 25;

// Directories to scan (expanded from just services/)
const SCAN_DIRS = ['services', 'components', 'pages', 'hooks', 'utils'];

export async function run({ runTests, runCommand, projectRoot }) {
  const report = {
    changes: [],
    documented: [],
    skipped: [],
  };

  console.log('Starting documentation generation...\n');

  // 1. Find files with undocumented exports across all of src/
  console.log('1. Finding undocumented functions and components...');
  const undocumented = await findUndocumentedFunctions(projectRoot);
  console.log(`Found ${undocumented.length} undocumented exports\n`);

  // 2. Prioritize by import count (most-imported files first)
  console.log('2. Prioritizing by import frequency...');
  const prioritized = await prioritizeByImportCount(undocumented, projectRoot);
  console.log(`  Top targets: ${prioritized.slice(0, 5).map(i => i.name).join(', ')}\n`);

  // 3. Generate JSDoc for undocumented functions (limit to DOCS_PER_RUN per run)
  console.log(`3. Generating JSDoc (up to ${DOCS_PER_RUN} per run)...`);
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  for (const item of prioritized.slice(0, DOCS_PER_RUN)) {
    console.log(`Documenting: ${item.file}::${item.name} (${item.itemType})`);

    try {
      const fileContent = await fs.readFile(item.fullPath, 'utf-8');

      const prompt = item.itemType === 'component'
        ? buildComponentPrompt(item, fileContent)
        : buildFunctionPrompt(item, fileContent);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      let jsdoc = response.content[0].text.trim();

      // Strip markdown code fences if Claude wrapped the response
      jsdoc = jsdoc
        .replace(/^```(?:javascript|js|jsdoc)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();

      // Validate it looks like JSDoc
      if (jsdoc.startsWith('/**') && jsdoc.endsWith('*/')) {
        // Insert JSDoc before the function/component
        const updatedContent = fileContent.replace(
          item.code,
          `${jsdoc}\n${item.code}`
        );

        await fs.writeFile(item.fullPath, updatedContent);
        report.documented.push(`${item.file}::${item.name}`);
        report.changes.push(`Added JSDoc to ${item.name} in ${item.file}`);
        console.log(`  ✓ Added JSDoc`);
      } else {
        console.log(`  ✗ Invalid JSDoc format, got: ${jsdoc.substring(0, 80)}...`);
        report.skipped.push({ file: item.file, name: item.name, reason: 'Invalid format' });
      }

    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      report.skipped.push({ file: item.file, name: item.name, reason: error.message });
    }
  }

  // 4. Update TODO.md if it exists
  console.log('\n4. Updating TODO.md...');
  await updateTodoMd(projectRoot, report);

  // 5. Verify tests still pass
  if (report.changes.length > 0) {
    console.log('\n5. Verifying tests...');
    const testResult = await runTests();
    if (!testResult.success) {
      console.log('⚠️ Tests failed after documentation changes');
      report.changes.push('Warning: Tests may have been affected');
    }
  }

  // Summary
  console.log('\n=== DOCUMENTATION SUMMARY ===');
  console.log(`Functions/components documented: ${report.documented.length}`);
  console.log(`Skipped: ${report.skipped.length}`);
  console.log(`Remaining undocumented: ${undocumented.length - report.documented.length}`);

  return report;
}

/**
 * Build JSDoc prompt for a React component
 */
function buildComponentPrompt(item, fileContent) {
  const propTypesInfo = item.propTypes
    ? `\nPropTypes: ${item.propTypes.join(', ')}`
    : '';

  return `Add JSDoc documentation to this React component. Only output the JSDoc comment block, nothing else.

Component:
\`\`\`javascript
${item.code}
\`\`\`
${propTypesInfo}

Context from file:
${fileContent.substring(0, 800)}...

Generate a concise JSDoc comment with:
- @component
- Brief description of what the component renders/does
- @param {Object} props
${item.propTypes ? item.propTypes.map(p => `- @param {*} props.${p} - description`).join('\n') : '- @param for each prop'}
- @returns {JSX.Element}
- @example if helpful (short)

Output only the JSDoc comment block starting with /** and ending with */`;
}

/**
 * Build JSDoc prompt for a function
 */
function buildFunctionPrompt(item, fileContent) {
  return `Add JSDoc documentation to this function. Only output the JSDoc comment block, nothing else.

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

Output only the JSDoc comment block starting with /** and ending with */`;
}

/**
 * Find exported functions and components without JSDoc across all src/ directories
 */
async function findUndocumentedFunctions(projectRoot) {
  const undocumented = [];

  // Scan all configured directories under src/
  for (const subDir of SCAN_DIRS) {
    const srcDir = path.join(projectRoot, 'src', subDir);
    await scanDir(srcDir, projectRoot, undocumented);
  }

  return undocumented;
}

async function scanDir(dir, projectRoot, undocumented) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDir(fullPath, projectRoot, undocumented);
    } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
      // Skip test files
      if (/\.(test|spec)\.(js|jsx)$/.test(entry.name)) continue;

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const relativePath = path.relative(projectRoot, fullPath);
        const isComponent = /\/components\//.test(relativePath) || /\.jsx$/.test(entry.name);

        // Extract PropTypes if this is a component
        let propTypes = null;
        if (isComponent) {
          const propTypesMatch = content.match(/\w+\.propTypes\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
          if (propTypesMatch) {
            propTypes = [];
            const propPattern = /(\w+)\s*:/g;
            let pm;
            while ((pm = propPattern.exec(propTypesMatch[1])) !== null) {
              if (pm[1] !== 'PropTypes') propTypes.push(pm[1]);
            }
          }
        }

        // Find exported functions/components without preceding JSDoc
        const functionPatterns = [
          // export function name
          /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
          // export const name = function/arrow
          /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
          // export const name = async function
          /export\s+const\s+(\w+)\s*=\s*async\s+function/g,
          // export default function name
          /export\s+default\s+(?:async\s+)?function\s+(\w+)/g,
        ];

        for (const pattern of functionPatterns) {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const functionName = match[1];
            const startIndex = match.index;

            // Check if there's a JSDoc comment before this
            const before = content.substring(Math.max(0, startIndex - 300), startIndex);
            if (!before.includes('*/')) {
              // Extract the function code (first 200 chars)
              const code = content.substring(startIndex, startIndex + 200);

              undocumented.push({
                file: relativePath,
                fullPath,
                name: functionName,
                code: match[0] + code.substring(match[0].length, code.indexOf('\n', match[0].length) + 50),
                itemType: isComponent ? 'component' : 'function',
                propTypes,
              });
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }
}

/**
 * Prioritize undocumented items by how many files import them (highest impact first)
 */
async function prioritizeByImportCount(undocumented, projectRoot) {
  // Build a map of file → import count
  const importCounts = {};
  const srcDir = path.join(projectRoot, 'src');

  async function countImportsInDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await countImportsInDir(fullPath);
      } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          // Find all import paths
          const importPattern = /from\s*['"]([^'"]+)['"]/g;
          let match;
          while ((match = importPattern.exec(content)) !== null) {
            const importPath = match[1];
            if (importPath.startsWith('.')) {
              // Resolve to a simple key
              const resolved = path.resolve(path.dirname(fullPath), importPath);
              const relative = path.relative(projectRoot, resolved);
              importCounts[relative] = (importCounts[relative] || 0) + 1;
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }

  await countImportsInDir(srcDir);

  // Score each undocumented item
  for (const item of undocumented) {
    const fileKey = item.file.replace(/\.(js|jsx)$/, '');
    const withExt = item.file;
    item.importCount = importCounts[fileKey] || importCounts[withExt] || 0;
  }

  // Sort: most imported first, then components before functions
  return undocumented.sort((a, b) => {
    if (b.importCount !== a.importCount) return b.importCount - a.importCount;
    if (a.itemType === 'component' && b.itemType !== 'component') return -1;
    if (b.itemType === 'component' && a.itemType !== 'component') return 1;
    return 0;
  });
}

/**
 * Update TODO.md with completion status
 */
async function updateTodoMd(projectRoot, report) {
  const todoPath = path.join(projectRoot, '..', 'docs', 'status', 'TODO.md');

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
