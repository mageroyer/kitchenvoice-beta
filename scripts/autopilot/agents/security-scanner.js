/**
 * Security Scanner Agent
 *
 * Scans for security vulnerabilities:
 * 1. npm audit for dependency vulnerabilities
 * 2. Check for exposed secrets
 * 3. Check for common security anti-patterns
 * 4. Auto-fix what's safe to fix
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

// Patterns that might indicate exposed secrets
const SECRET_PATTERNS = [
  { name: 'API Key', pattern: /['"]?api[_-]?key['"]?\s*[:=]\s*['"][^'"]+['"]/gi },
  { name: 'Secret', pattern: /['"]?secret['"]?\s*[:=]\s*['"][^'"]+['"]/gi },
  { name: 'Password', pattern: /['"]?password['"]?\s*[:=]\s*['"][^'"]+['"]/gi },
  { name: 'Token', pattern: /['"]?token['"]?\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |)PRIVATE KEY-----/g },
  { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g },
];

// Files/directories to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '*.min.js',
  'package-lock.json',
];

export async function run({ runTests, runCommand, projectRoot }) {
  const report = {
    changes: [],
    vulnerabilities: [],
    secrets: [],
    patterns: [],
  };

  console.log('Starting security scan...\n');

  // 1. Run npm audit
  console.log('1. Running npm audit...');
  const auditResult = await runCommand('npm audit --json 2>/dev/null || echo "{}"');

  try {
    const audit = JSON.parse(auditResult.stdout || '{}');
    const vulns = audit.vulnerabilities || {};

    for (const [name, data] of Object.entries(vulns)) {
      if (data.severity === 'critical' || data.severity === 'high') {
        report.vulnerabilities.push({
          package: name,
          severity: data.severity,
          via: data.via?.[0]?.title || 'Unknown',
          fixAvailable: data.fixAvailable,
        });
      }
    }

    console.log(`Found ${report.vulnerabilities.length} high/critical vulnerabilities`);
  } catch (e) {
    console.log('Could not parse audit results');
  }

  // 2. Auto-fix vulnerabilities if possible
  if (report.vulnerabilities.some(v => v.fixAvailable)) {
    console.log('\n2. Attempting to fix vulnerabilities...');
    const fixResult = await runCommand('npm audit fix');

    if (fixResult.success) {
      // Verify tests still pass
      const testResult = await runTests();
      if (testResult.success) {
        report.changes.push('Auto-fixed npm audit vulnerabilities');
        console.log('✓ Vulnerabilities fixed and tests passing');
      } else {
        // Rollback
        await runCommand('git checkout package.json package-lock.json && npm install');
        console.log('✗ Fix broke tests, rolled back');
      }
    }
  }

  // 3. Scan for exposed secrets
  console.log('\n3. Scanning for exposed secrets...');
  await scanForSecrets(projectRoot, report);

  // 4. Check for security anti-patterns
  console.log('\n4. Checking for security anti-patterns...');
  await checkSecurityPatterns(projectRoot, report);

  // 5. Generate summary
  console.log('\n=== SECURITY SCAN SUMMARY ===');
  console.log(`Vulnerabilities: ${report.vulnerabilities.length}`);
  console.log(`Potential secrets: ${report.secrets.length}`);
  console.log(`Anti-patterns: ${report.patterns.length}`);
  console.log(`Fixes applied: ${report.changes.length}`);

  if (report.secrets.length > 0) {
    console.log('\n⚠️ POTENTIAL SECRETS FOUND:');
    report.secrets.forEach(s => {
      console.log(`  ${s.file}: ${s.type} (line ${s.line})`);
    });
  }

  return report;
}

/**
 * Scan files for potential secrets
 */
async function scanForSecrets(projectRoot, report) {
  const srcDir = path.join(projectRoot, 'src');

  async function scanDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      // Skip excluded patterns
      if (SKIP_PATTERNS.some(p => {
        if (p.includes('*')) {
          const regex = new RegExp(p.replace('*', '.*'));
          return regex.test(entry.name);
        }
        return entry.name === p || relativePath.includes(p);
      })) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx|json|env)$/.test(entry.name)) {
        // Skip .env.example
        if (entry.name === '.env.example') continue;

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (const { name, pattern } of SECRET_PATTERNS) {
            let lineNum = 0;
            for (const line of lines) {
              lineNum++;

              // Skip comments and common false positives
              if (line.trim().startsWith('//') || line.trim().startsWith('#')) continue;
              if (line.includes('process.env')) continue;
              if (line.includes('import.meta.env')) continue;
              if (line.includes('example') || line.includes('placeholder')) continue;

              if (pattern.test(line)) {
                report.secrets.push({
                  file: relativePath,
                  type: name,
                  line: lineNum,
                  preview: line.substring(0, 50) + '...',
                });
              }
              // Reset regex
              pattern.lastIndex = 0;
            }
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  await scanDir(srcDir);
}

/**
 * Check for common security anti-patterns
 */
async function checkSecurityPatterns(projectRoot, report) {
  const antiPatterns = [
    {
      name: 'eval() usage',
      pattern: /\beval\s*\(/g,
      severity: 'high',
    },
    {
      name: 'innerHTML assignment',
      pattern: /\.innerHTML\s*=/g,
      severity: 'medium',
    },
    {
      name: 'dangerouslySetInnerHTML',
      pattern: /dangerouslySetInnerHTML/g,
      severity: 'medium',
    },
    {
      name: 'document.write',
      pattern: /document\.write\s*\(/g,
      severity: 'medium',
    },
    {
      name: 'SQL-like string concatenation',
      pattern: /['"`]\s*\+\s*\w+\s*\+\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE)/gi,
      severity: 'high',
    },
  ];

  const srcDir = path.join(projectRoot, 'src');

  async function scanDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const relativePath = path.relative(projectRoot, fullPath);

          for (const ap of antiPatterns) {
            if (ap.pattern.test(content)) {
              report.patterns.push({
                file: relativePath,
                pattern: ap.name,
                severity: ap.severity,
              });
            }
            ap.pattern.lastIndex = 0;
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  await scanDir(srcDir);
}
