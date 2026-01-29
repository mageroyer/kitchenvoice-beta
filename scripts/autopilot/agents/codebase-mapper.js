/**
 * Codebase Mapper Agent
 *
 * Scans the entire codebase and produces:
 * 1. docs/manifest.json — Machine-readable codebase map (Layer 1)
 * 2. docs/SYSTEM_MAP.md — Mermaid dependency graphs (Layer 4)
 * 3. docs/COMPONENT_CATALOG.md — Component index table (Layer 3)
 * 4. docs/SERVICE_REFERENCE.md — Service function index (Layer 3)
 * 5. docs/PAGES_REFERENCE.md — Page routes index (Layer 3)
 * 6. docs/HOOKS_REFERENCE.md — Hooks reference (Layer 3)
 * 7. docs/coverage.json — Staleness + JSDoc coverage (Layer 4)
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

// ── Configuration ──

const SRC_DIR = 'src';
const DOCS_DIR = path.resolve(process.cwd(), '../../docs');
const FILE_EXTENSIONS = /\.(js|jsx)$/;
const IGNORE_DIRS = ['node_modules', '__tests__', '.vite', 'dist', 'build', '__mocks__'];
const IGNORE_FILES = [/\.test\.(js|jsx)$/, /\.spec\.(js|jsx)$/, /setupTests\.js$/];

// ── File Classification ──

function classifyFile(relativePath) {
  if (/\/services\//.test(relativePath)) return 'service';
  if (/\/components\//.test(relativePath)) return 'component';
  if (/\/pages\//.test(relativePath)) return 'page';
  if (/\/hooks\//.test(relativePath)) return 'hook';
  if (/\/utils\//.test(relativePath)) return 'util';
  if (/\/constants\//.test(relativePath)) return 'constant';
  if (/\/styles\//.test(relativePath)) return 'style';
  if (/\/context\//.test(relativePath)) return 'context';
  return 'other';
}

// ── Export Extraction ──

function extractExports(content) {
  const exports = [];

  // export function name / export async function name
  const funcPattern = /export\s+(async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcPattern.exec(content)) !== null) {
    const kind = match[1] ? 'async function' : 'function';
    exports.push({
      name: match[2],
      kind,
      hasJSDoc: hasJSDocBefore(content, match.index),
      line: getLineNumber(content, match.index),
    });
  }

  // export const name = ...
  const constPattern = /export\s+const\s+(\w+)\s*=/g;
  while ((match = constPattern.exec(content)) !== null) {
    // Determine kind by what follows the =
    const after = content.substring(match.index + match[0].length, match.index + match[0].length + 100).trim();
    let kind = 'const';
    if (/^async\s/.test(after) || /^\([^)]*\)\s*=>/.test(after) || /^function/.test(after)) {
      kind = /^async/.test(after) ? 'async function' : 'function';
    }
    exports.push({
      name: match[1],
      kind,
      hasJSDoc: hasJSDocBefore(content, match.index),
      line: getLineNumber(content, match.index),
    });
  }

  // export class name
  const classPattern = /export\s+class\s+(\w+)/g;
  while ((match = classPattern.exec(content)) !== null) {
    exports.push({
      name: match[1],
      kind: 'class',
      hasJSDoc: hasJSDocBefore(content, match.index),
      line: getLineNumber(content, match.index),
    });
  }

  // export default function name / export default class name
  const defaultFuncPattern = /export\s+default\s+(?:async\s+)?function\s+(\w+)/g;
  while ((match = defaultFuncPattern.exec(content)) !== null) {
    exports.push({
      name: match[1],
      kind: 'default',
      hasJSDoc: hasJSDocBefore(content, match.index),
      line: getLineNumber(content, match.index),
    });
  }

  // export default ComponentName (standalone)
  const defaultNamePattern = /export\s+default\s+(\w+)\s*;/g;
  while ((match = defaultNamePattern.exec(content)) !== null) {
    // Avoid duplicates if already captured as default function/class
    if (!exports.some(e => e.name === match[1])) {
      exports.push({
        name: match[1],
        kind: 'default',
        hasJSDoc: hasJSDocBefore(content, match.index),
        line: getLineNumber(content, match.index),
      });
    }
  }

  // Barrel re-exports: export { X, Y } from './module'
  const barrelPattern = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = barrelPattern.exec(content)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
    for (const name of names) {
      exports.push({
        name,
        kind: 're-export',
        hasJSDoc: false,
        line: getLineNumber(content, match.index),
        from: match[2],
      });
    }
  }

  return exports;
}

// ── Import Extraction ──

function extractImports(content) {
  const imports = [];

  // import { X, Y } from './path'
  const namedPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = namedPattern.exec(content)) !== null) {
    const names = match[1].split(',').map(n => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    }).filter(Boolean);
    imports.push({ from: match[2], names });
  }

  // import X from './path'
  const defaultPattern = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = defaultPattern.exec(content)) !== null) {
    // Skip if already captured as part of { } import
    const existing = imports.find(i => i.from === match[2]);
    if (existing) {
      if (!existing.names.includes(match[1])) {
        existing.names.unshift(match[1]);
      }
    } else {
      imports.push({ from: match[2], names: [match[1]] });
    }
  }

  // import * as X from './path'
  const starPattern = /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = starPattern.exec(content)) !== null) {
    imports.push({ from: match[2], names: [`* as ${match[1]}`] });
  }

  return imports;
}

// ── PropTypes Extraction ──

function extractPropTypes(content) {
  // Match Component.propTypes = { ... }
  const propTypesPattern = /\w+\.propTypes\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s;
  const match = content.match(propTypesPattern);
  if (!match) return null;

  const block = match[1];
  // Extract property names (keys before the colon)
  const propNames = [];
  const propPattern = /(\w+)\s*:/g;
  let propMatch;
  while ((propMatch = propPattern.exec(block)) !== null) {
    // Skip PropTypes itself (the value side)
    if (propMatch[1] !== 'PropTypes') {
      propNames.push(propMatch[1]);
    }
  }

  return propNames.length > 0 ? propNames : null;
}

// ── Helper: Check for JSDoc before position ──

function hasJSDocBefore(content, index) {
  // Look at the 500 chars before this position for a JSDoc comment
  const before = content.substring(Math.max(0, index - 500), index);
  // Find the last JSDoc ending
  const lastDocEnd = before.lastIndexOf('*/');
  if (lastDocEnd === -1) return false;

  // Check that the JSDoc starts with /**
  const docStart = before.lastIndexOf('/**');
  if (docStart === -1 || docStart > lastDocEnd) return false;

  // Make sure nothing substantial is between the JSDoc end and the export
  const between = before.substring(lastDocEnd + 2).trim();
  // Allow empty space, decorators, or single-line comments
  return between.length === 0 || /^(\s|\/\/[^\n]*\n)*$/.test(between);
}

// ── Helper: Get line number from position ──

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

// ── Helper: Count lines ──

function countLines(content) {
  return content.split('\n').length;
}

// ── Helper: Get git last modified date ──

function getGitLastModified(filePath, projectRoot) {
  try {
    const result = execSync(
      `git log -1 --format="%ai" -- "${filePath}"`,
      { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (result) {
      return result.split(' ')[0]; // YYYY-MM-DD
    }
  } catch {
    // Git not available or file not tracked
  }
  return null;
}

// ── Helper: Resolve import path to actual file ──

function resolveImportPath(importFrom, currentFileDir, srcRoot) {
  // Skip external packages
  if (!importFrom.startsWith('.') && !importFrom.startsWith('/')) return null;

  const candidates = [
    importFrom,
    importFrom + '.js',
    importFrom + '.jsx',
    importFrom + '/index.js',
    importFrom + '/index.jsx',
  ];

  for (const candidate of candidates) {
    const resolved = path.resolve(currentFileDir, candidate);
    const relative = path.relative(srcRoot, resolved).replace(/\\/g, '/');
    if (relative.startsWith('..')) continue;
    return 'src/' + relative;
  }

  return null;
}

// ── Core Scanner ──

async function scanDirectory(dir, projectRoot, srcRoot) {
  const files = {};
  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      const subFiles = await scanDirectory(fullPath, projectRoot, srcRoot);
      Object.assign(files, subFiles);
    } else if (entry.isFile() && FILE_EXTENSIONS.test(entry.name)) {
      // Skip test files
      if (IGNORE_FILES.some(pattern => pattern.test(entry.name))) continue;

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

        files[relativePath] = {
          type: classifyFile(relativePath),
          lines: countLines(content),
          lastModified: getGitLastModified(relativePath, projectRoot),
          exports: extractExports(content),
          imports: extractImports(content),
          propTypes: extractPropTypes(content),
        };
      } catch {
        // Skip unreadable files
      }
    }
  }

  return files;
}

// ── Build Dependency Map ──

function buildDependencyMap(files, srcRoot) {
  const dependencies = {};

  // Build a lookup set of all known file paths for fast matching
  const knownFiles = new Set(Object.keys(files));
  // Also build a lookup without extensions for fuzzy matching
  const knownFilesNoExt = {};
  for (const fp of knownFiles) {
    const noExt = fp.replace(/\.(js|jsx)$/, '');
    knownFilesNoExt[noExt] = fp;
    // Also index without /index suffix
    if (noExt.endsWith('/index')) {
      knownFilesNoExt[noExt.replace(/\/index$/, '')] = fp;
    }
  }

  for (const [filePath, fileData] of Object.entries(files)) {
    const deps = new Set();
    const fileDir = path.dirname(path.resolve(srcRoot, '..', filePath));

    for (const imp of fileData.imports) {
      // Skip external packages (npm modules, css, images)
      if (!imp.from.startsWith('.') && !imp.from.startsWith('/')) continue;
      if (/\.(css|scss|module\.css|png|jpg|svg)$/.test(imp.from)) continue;

      const resolved = path.resolve(fileDir, imp.from);
      const relative = path.relative(srcRoot, resolved).replace(/\\/g, '/');
      if (relative.startsWith('..')) continue;

      const candidate = 'src/' + relative;

      // Try exact match, then with extensions, then /index variants
      const found = knownFiles.has(candidate)
        ? candidate
        : knownFiles.has(candidate + '.js')
          ? candidate + '.js'
          : knownFiles.has(candidate + '.jsx')
            ? candidate + '.jsx'
            : knownFilesNoExt[candidate] || null;

      if (found) {
        deps.add(found);
      }
    }

    dependencies[filePath] = [...deps];
  }

  return dependencies;
}

// ── Detect Circular Dependencies ──

function detectCircularDependencies(dependencies) {
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();

  function dfs(node, path) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const dep of (dependencies[node] || [])) {
      dfs(dep, [...path]);
    }

    inStack.delete(node);
  }

  for (const node of Object.keys(dependencies)) {
    dfs(node, []);
  }

  // Deduplicate cycles (same cycle can be found from different start nodes)
  const seen = new Set();
  return cycles.filter(cycle => {
    const sorted = [...cycle].sort().join(' -> ');
    if (seen.has(sorted)) return false;
    seen.add(sorted);
    return true;
  });
}

// ── Generate Summary Stats ──

function generateSummary(files) {
  const summary = {
    totalFiles: Object.keys(files).length,
    totalLines: 0,
    totalExports: 0,
    jsdocCount: 0,
    jsdocCoverage: '0%',
    byType: {},
  };

  for (const fileData of Object.values(files)) {
    summary.totalLines += fileData.lines;
    summary.byType[fileData.type] = (summary.byType[fileData.type] || 0) + 1;

    for (const exp of fileData.exports) {
      summary.totalExports++;
      if (exp.hasJSDoc) summary.jsdocCount++;
    }
  }

  if (summary.totalExports > 0) {
    const pct = Math.round((summary.jsdocCount / summary.totalExports) * 100);
    summary.jsdocCoverage = `${pct}%`;
  }

  return summary;
}

// ══════════════════════════════════════════════════
//  PHASE 2: Mermaid Dependency Graph Generation
// ══════════════════════════════════════════════════

function shortName(filePath) {
  // src/services/inventory/stockService.js → stockService
  const base = path.basename(filePath, path.extname(filePath));
  return base;
}

function generateServiceDependencyGraph(files, dependencies) {
  const serviceFiles = Object.keys(files).filter(f => files[f].type === 'service');
  const edges = [];

  for (const svc of serviceFiles) {
    for (const dep of (dependencies[svc] || [])) {
      if (files[dep] && (files[dep].type === 'service' || files[dep].type === 'util')) {
        edges.push(`  ${shortName(svc)} --> ${shortName(dep)}`);
      }
    }
  }

  if (edges.length === 0) return null;

  // Deduplicate edges
  const uniqueEdges = [...new Set(edges)];

  return `\`\`\`mermaid
flowchart LR
${uniqueEdges.slice(0, 80).join('\n')}
\`\`\``;
}

function generatePageToComponentGraph(files, dependencies) {
  const pageFiles = Object.keys(files).filter(f => files[f].type === 'page');
  const edges = [];

  for (const page of pageFiles) {
    for (const dep of (dependencies[page] || [])) {
      if (files[dep] && files[dep].type === 'component') {
        edges.push(`  ${shortName(page)} --> ${shortName(dep)}`);
      }
    }
  }

  if (edges.length === 0) return null;

  const uniqueEdges = [...new Set(edges)];

  return `\`\`\`mermaid
flowchart LR
${uniqueEdges.slice(0, 80).join('\n')}
\`\`\``;
}

function generateComponentToServiceGraph(files, dependencies) {
  const componentFiles = Object.keys(files).filter(f =>
    files[f].type === 'component' || files[f].type === 'page'
  );
  const edges = [];

  for (const comp of componentFiles) {
    for (const dep of (dependencies[comp] || [])) {
      if (files[dep] && files[dep].type === 'service') {
        edges.push(`  ${shortName(comp)} --> ${shortName(dep)}`);
      }
    }
  }

  if (edges.length === 0) return null;

  const uniqueEdges = [...new Set(edges)];

  return `\`\`\`mermaid
flowchart LR
${uniqueEdges.slice(0, 80).join('\n')}
\`\`\``;
}

function generateSystemMapMd(files, dependencies, cycles) {
  const timestamp = new Date().toISOString();

  let md = `<!-- AUTO-GENERATED by codebase-mapper agent — do not edit manually -->
<!-- Generated: ${timestamp} -->

# System Map

Dependency graphs auto-generated from import analysis.

## Service Dependencies

Services and their internal dependencies.

`;

  const svcGraph = generateServiceDependencyGraph(files, dependencies);
  md += svcGraph ? svcGraph + '\n\n' : '_No service dependencies found._\n\n';

  md += `## Page → Component Dependencies

Which components each page renders.

`;

  const pageGraph = generatePageToComponentGraph(files, dependencies);
  md += pageGraph ? pageGraph + '\n\n' : '_No page-component dependencies found._\n\n';

  md += `## Component/Page → Service Dependencies

Which services components and pages use for data.

`;

  const compGraph = generateComponentToServiceGraph(files, dependencies);
  md += compGraph ? compGraph + '\n\n' : '_No component-service dependencies found._\n\n';

  md += `## Circular Dependencies

`;

  if (cycles.length > 0) {
    md += `**${cycles.length} circular dependency cycle(s) detected:**\n\n`;
    for (const cycle of cycles.slice(0, 20)) {
      md += `- ${cycle.map(shortName).join(' → ')}\n`;
    }
  } else {
    md += '_No circular dependencies detected._\n';
  }

  md += `\n---\n*Auto-generated by codebase-mapper agent on ${timestamp.split('T')[0]}*\n`;

  return md;
}

// ══════════════════════════════════════════════════
//  PHASE 3: Reference Doc Generation
// ══════════════════════════════════════════════════

function generateComponentCatalog(files) {
  const components = Object.entries(files)
    .filter(([, data]) => data.type === 'component')
    .sort(([a], [b]) => a.localeCompare(b));

  let md = `<!-- AUTO-GENERATED by codebase-mapper agent — do not edit manually -->

# Component Catalog

All ${components.length} components in the codebase.

| Component | Path | Props | Lines | Has JSDoc |
|-----------|------|-------|-------|-----------|
`;

  for (const [filePath, data] of components) {
    const name = path.basename(filePath, path.extname(filePath));
    const props = data.propTypes ? data.propTypes.join(', ') : '—';
    const truncatedProps = props.length > 60 ? props.substring(0, 57) + '...' : props;
    const hasDoc = data.exports.some(e => e.hasJSDoc) ? 'Yes' : 'No';
    md += `| ${name} | \`${filePath}\` | ${truncatedProps} | ${data.lines} | ${hasDoc} |\n`;
  }

  md += `\n---\n*Auto-generated by codebase-mapper agent on ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

function generateServiceReference(files) {
  const services = Object.entries(files)
    .filter(([, data]) => data.type === 'service')
    .sort(([a], [b]) => a.localeCompare(b));

  let md = `<!-- AUTO-GENERATED by codebase-mapper agent — do not edit manually -->

# Service Reference

All ${services.length} service files in the codebase.

| Service | Path | Exports | Lines | JSDoc Coverage |
|---------|------|---------|-------|----------------|
`;

  for (const [filePath, data] of services) {
    const name = path.basename(filePath, path.extname(filePath));
    const exportNames = data.exports.map(e => e.name).join(', ');
    const truncatedExports = exportNames.length > 60 ? exportNames.substring(0, 57) + '...' : exportNames;
    const docCount = data.exports.filter(e => e.hasJSDoc).length;
    const total = data.exports.length;
    const coverage = total > 0 ? `${docCount}/${total}` : '—';
    md += `| ${name} | \`${filePath}\` | ${truncatedExports} | ${data.lines} | ${coverage} |\n`;
  }

  md += `\n---\n*Auto-generated by codebase-mapper agent on ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

function generatePagesReference(files, dependencies) {
  const pages = Object.entries(files)
    .filter(([, data]) => data.type === 'page')
    .sort(([a], [b]) => a.localeCompare(b));

  let md = `<!-- AUTO-GENERATED by codebase-mapper agent — do not edit manually -->

# Pages Reference

All ${pages.length} page files in the codebase.

| Page | Path | Components Used | Lines |
|------|------|----------------|-------|
`;

  for (const [filePath, data] of pages) {
    const name = path.basename(filePath, path.extname(filePath));
    const componentDeps = (dependencies[filePath] || [])
      .filter(dep => files[dep] && files[dep].type === 'component')
      .map(dep => path.basename(dep, path.extname(dep)));
    const comps = componentDeps.length > 0 ? componentDeps.join(', ') : '—';
    const truncatedComps = comps.length > 60 ? comps.substring(0, 57) + '...' : comps;
    md += `| ${name} | \`${filePath}\` | ${truncatedComps} | ${data.lines} |\n`;
  }

  md += `\n---\n*Auto-generated by codebase-mapper agent on ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

function generateHooksReference(files, dependencies) {
  const hooks = Object.entries(files)
    .filter(([, data]) => data.type === 'hook')
    .sort(([a], [b]) => a.localeCompare(b));

  // Also find files that look like hooks by name but may be classified differently
  const hookByName = Object.entries(files)
    .filter(([filePath]) => /\/use\w+\.(js|jsx)$/.test(filePath))
    .filter(([filePath]) => !hooks.some(([p]) => p === filePath))
    .sort(([a], [b]) => a.localeCompare(b));

  const allHooks = [...hooks, ...hookByName];

  // Find which files use each hook
  const usedBy = {};
  for (const [hookPath] of allHooks) {
    usedBy[hookPath] = [];
    for (const [filePath, data] of Object.entries(dependencies)) {
      if ((dependencies[filePath] || []).includes(hookPath)) {
        usedBy[hookPath].push(path.basename(filePath, path.extname(filePath)));
      }
    }
  }

  let md = `<!-- AUTO-GENERATED by codebase-mapper agent — do not edit manually -->

# Hooks Reference

All ${allHooks.length} custom hooks in the codebase.

| Hook | Path | Exports | Used By | Has JSDoc |
|------|------|---------|---------|-----------|
`;

  for (const [filePath, data] of allHooks) {
    const name = path.basename(filePath, path.extname(filePath));
    const exportNames = data.exports.map(e => e.name).join(', ');
    const users = usedBy[filePath]?.join(', ') || '—';
    const truncatedUsers = users.length > 50 ? users.substring(0, 47) + '...' : users;
    const hasDoc = data.exports.some(e => e.hasJSDoc) ? 'Yes' : 'No';
    md += `| ${name} | \`${filePath}\` | ${exportNames} | ${truncatedUsers} | ${hasDoc} |\n`;
  }

  md += `\n---\n*Auto-generated by codebase-mapper agent on ${new Date().toISOString().split('T')[0]}*\n`;
  return md;
}

// ══════════════════════════════════════════════════
//  PHASE 4: Staleness Detection + Coverage
// ══════════════════════════════════════════════════

function getLatestCodeChange(globPattern, projectRoot) {
  try {
    // Convert glob to git-friendly path
    const result = execSync(
      `git log -1 --format="%ai" -- "${globPattern}"`,
      { cwd: projectRoot, encoding: 'utf-8', timeout: 10000 }
    ).trim();
    if (result) return result.split(' ')[0];
  } catch {
    // Ignore
  }
  return null;
}

function getDocLastModified(docPath, projectRoot) {
  try {
    const result = execSync(
      `git log -1 --format="%ai" -- "${docPath}"`,
      { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (result) return result.split(' ')[0];
  } catch {
    // Ignore
  }
  return null;
}

async function detectStaleness(projectRoot) {
  const staleness = {};
  const docsDir = path.join(projectRoot, '..', 'docs');

  // Map of docs to their covered code paths
  const docCoverageMap = {
    'SYSTEM_ARCHITECTURE.md': ['src/services/**', 'src/components/**', 'src/pages/**'],
    'INVOICE_ARCHITECTURE.md': ['src/services/invoice/**', 'src/components/invoice/**'],
    'DATABASE_SCHEMA.md': ['src/services/database/**'],
    'INVENTORY_SYSTEM.md': ['src/services/inventory/**', 'src/components/inventory/**'],
    'API_REFERENCE.md': ['src/services/**'],
    'WEBSITE_BUILDER.md': ['src/components/website/**', 'src/services/database/websiteDB.js', 'src/services/database/websiteSchema.js'],
    'VOICE_RECOGNITION_GUIDE.md': ['src/services/voice/**', 'src/components/voice/**'],
  };

  // Also try reading frontmatter from docs
  try {
    const docFiles = await fs.readdir(docsDir);
    for (const docFile of docFiles) {
      if (!docFile.endsWith('.md')) continue;

      try {
        const content = await fs.readFile(path.join(docsDir, docFile), 'utf-8');
        const frontmatterMatch = content.match(/<!--\s*covers:\s*(.+?)\s*-->/);
        if (frontmatterMatch) {
          const patterns = frontmatterMatch[1].split(',').map(p => p.trim());
          docCoverageMap[docFile] = patterns;
        }
      } catch {
        // Skip unreadable
      }
    }
  } catch {
    // Ignore
  }

  for (const [docFile, patterns] of Object.entries(docCoverageMap)) {
    const docPath = `docs/${docFile}`;
    const lastDocUpdate = getDocLastModified(docPath, path.join(projectRoot, '..'));

    let latestCodeChange = null;
    for (const pattern of patterns) {
      const change = getLatestCodeChange(
        `app-new/${pattern}`,
        path.join(projectRoot, '..')
      );
      if (change && (!latestCodeChange || change > latestCodeChange)) {
        latestCodeChange = change;
      }
    }

    if (lastDocUpdate && latestCodeChange) {
      const docDate = new Date(lastDocUpdate);
      const codeDate = new Date(latestCodeChange);
      const diffDays = Math.floor((codeDate - docDate) / (1000 * 60 * 60 * 24));

      staleness[docPath] = {
        lastDocUpdate,
        coversFiles: patterns,
        latestCodeChange,
        staleDays: Math.max(0, diffDays),
        stale: diffDays > 0,
      };
    }
  }

  return staleness;
}

function computeJSDocCoverage(files) {
  const coverage = {};
  const types = ['service', 'component', 'page', 'hook', 'util'];

  for (const type of types) {
    const typeFiles = Object.values(files).filter(f => f.type === type);
    let total = 0;
    let documented = 0;

    for (const file of typeFiles) {
      for (const exp of file.exports) {
        total++;
        if (exp.hasJSDoc) documented++;
      }
    }

    const pct = total > 0 ? Math.round((documented / total) * 100) : 0;
    coverage[type + 's'] = {
      total,
      documented,
      percent: `${pct}%`,
    };
  }

  return coverage;
}

async function generateCoverageJson(files, projectRoot) {
  const staleness = await detectStaleness(projectRoot);
  const jsdocCoverage = computeJSDocCoverage(files);

  return {
    generatedAt: new Date().toISOString(),
    staleness,
    jsdocCoverage,
    staleDocCount: Object.values(staleness).filter(s => s.stale).length,
    staleDocs: Object.entries(staleness)
      .filter(([, s]) => s.stale)
      .map(([doc, s]) => `${doc} (${s.staleDays} days behind)`)
  };
}

// ══════════════════════════════════════════════════
//  MAIN AGENT ENTRY POINT
// ══════════════════════════════════════════════════

export async function run({ projectRoot }) {
  const report = {
    changes: [],
    metrics: {},
  };

  console.log('Starting codebase mapper agent...\n');

  const srcRoot = path.join(projectRoot, SRC_DIR);

  // ── Phase 1: Scan codebase and build manifest ──
  console.log('Phase 1: Scanning codebase...');
  const files = await scanDirectory(srcRoot, projectRoot, srcRoot);
  const fileCount = Object.keys(files).length;
  console.log(`  Scanned ${fileCount} files\n`);

  console.log('Phase 1b: Building dependency map...');
  const dependencies = buildDependencyMap(files, srcRoot);
  const depCount = Object.values(dependencies).reduce((sum, deps) => sum + deps.length, 0);
  console.log(`  Found ${depCount} dependency edges\n`);

  console.log('Phase 1c: Detecting circular dependencies...');
  const cycles = detectCircularDependencies(dependencies);
  console.log(`  Found ${cycles.length} circular dependency cycle(s)\n`);

  const summary = generateSummary(files);

  const manifest = {
    generatedAt: new Date().toISOString(),
    summary,
    files,
    dependencies,
    circularDependencies: cycles.map(c => c.map(shortName)),
  };

  // Write manifest.json
  const manifestPath = path.join(DOCS_DIR, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Wrote manifest.json (${fileCount} files)\n`);
  report.changes.push(`Generated manifest.json with ${fileCount} files, ${summary.totalLines} lines, ${summary.jsdocCoverage} JSDoc coverage`);

  // ── Phase 2: Generate Mermaid dependency graphs ──
  console.log('Phase 2: Generating dependency graphs...');
  const systemMapMd = generateSystemMapMd(files, dependencies, cycles);
  const systemMapPath = path.join(DOCS_DIR, 'SYSTEM_MAP.md');
  await fs.writeFile(systemMapPath, systemMapMd);
  console.log('  Wrote SYSTEM_MAP.md\n');
  report.changes.push('Generated SYSTEM_MAP.md with Mermaid dependency graphs');

  // ── Phase 3: Generate reference docs ──
  console.log('Phase 3: Generating reference documentation...');

  const componentCatalog = generateComponentCatalog(files);
  await fs.writeFile(path.join(DOCS_DIR, 'COMPONENT_CATALOG.md'), componentCatalog);
  const componentCount = Object.values(files).filter(f => f.type === 'component').length;
  console.log(`  Wrote COMPONENT_CATALOG.md (${componentCount} components)`);
  report.changes.push(`Generated COMPONENT_CATALOG.md with ${componentCount} components`);

  const serviceRef = generateServiceReference(files);
  await fs.writeFile(path.join(DOCS_DIR, 'SERVICE_REFERENCE.md'), serviceRef);
  const serviceCount = Object.values(files).filter(f => f.type === 'service').length;
  console.log(`  Wrote SERVICE_REFERENCE.md (${serviceCount} services)`);
  report.changes.push(`Generated SERVICE_REFERENCE.md with ${serviceCount} services`);

  const pagesRef = generatePagesReference(files, dependencies);
  await fs.writeFile(path.join(DOCS_DIR, 'PAGES_REFERENCE.md'), pagesRef);
  const pageCount = Object.values(files).filter(f => f.type === 'page').length;
  console.log(`  Wrote PAGES_REFERENCE.md (${pageCount} pages)`);
  report.changes.push(`Generated PAGES_REFERENCE.md with ${pageCount} pages`);

  const hooksRef = generateHooksReference(files, dependencies);
  await fs.writeFile(path.join(DOCS_DIR, 'HOOKS_REFERENCE.md'), hooksRef);
  console.log('  Wrote HOOKS_REFERENCE.md\n');
  report.changes.push('Generated HOOKS_REFERENCE.md');

  // ── Phase 4: Staleness detection + coverage ──
  console.log('Phase 4: Computing staleness + coverage...');
  const coverage = await generateCoverageJson(files, projectRoot);
  const coveragePath = path.join(DOCS_DIR, 'coverage.json');
  await fs.writeFile(coveragePath, JSON.stringify(coverage, null, 2));
  console.log(`  Wrote coverage.json (${coverage.staleDocCount} stale docs)\n`);
  report.changes.push(`Generated coverage.json — ${coverage.staleDocCount} stale docs, JSDoc coverage: services ${coverage.jsdocCoverage.services?.percent || '?'}, components ${coverage.jsdocCoverage.components?.percent || '?'}`);

  // ── Report metrics ──
  report.metrics = {
    filesScanned: fileCount,
    totalLines: summary.totalLines,
    jsdocCoverage: summary.jsdocCoverage,
    dependencyEdges: depCount,
    circularDeps: cycles.length,
    staleDocs: coverage.staleDocCount,
    byType: summary.byType,
  };

  // ── GitHub Actions Summary ──
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fsMod = await import('fs');
    const ghSummary = `## Codebase Mapper Report

| Metric | Value |
|--------|-------|
| **Files Scanned** | ${fileCount} |
| **Total Lines** | ${summary.totalLines.toLocaleString()} |
| **JSDoc Coverage** | ${summary.jsdocCoverage} |
| **Dependency Edges** | ${depCount} |
| **Circular Deps** | ${cycles.length} |
| **Stale Docs** | ${coverage.staleDocCount} |

### Files by Type
| Type | Count |
|------|-------|
${Object.entries(summary.byType).map(([type, count]) => `| ${type} | ${count} |`).join('\n')}

### JSDoc Coverage by Type
| Type | Documented | Total | Coverage |
|------|-----------|-------|----------|
${Object.entries(coverage.jsdocCoverage).map(([type, data]) => `| ${type} | ${data.documented} | ${data.total} | ${data.percent} |`).join('\n')}

### Stale Documentation
${coverage.staleDocs.length > 0 ? coverage.staleDocs.map(d => '- ' + d).join('\n') : 'All docs are up to date.'}

---
*Generated by SmartCookBook Autopilot — Codebase Mapper at ${new Date().toISOString()}*
`;
    fsMod.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ghSummary);
    console.log('(Summary written to GitHub Actions)\n');
  }

  // ── Summary ──
  console.log('=== CODEBASE MAPPER SUMMARY ===');
  console.log(`Files scanned: ${fileCount}`);
  console.log(`Total lines: ${summary.totalLines.toLocaleString()}`);
  console.log(`JSDoc coverage: ${summary.jsdocCoverage}`);
  console.log(`Dependency edges: ${depCount}`);
  console.log(`Circular deps: ${cycles.length}`);
  console.log(`Stale docs: ${coverage.staleDocCount}`);
  console.log(`\nFiles generated: manifest.json, SYSTEM_MAP.md, COMPONENT_CATALOG.md, SERVICE_REFERENCE.md, PAGES_REFERENCE.md, HOOKS_REFERENCE.md, coverage.json`);

  return report;
}
