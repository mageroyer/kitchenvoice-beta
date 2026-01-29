/**
 * Dependency Updater Agent
 *
 * Safely updates dependencies:
 * 1. Check for outdated packages
 * 2. Update one at a time
 * 3. Run tests after each update
 * 4. Rollback if tests fail
 */

import fs from 'fs/promises';
import path from 'path';

export async function run({ runTests, runCommand, projectRoot }) {
  const report = {
    changes: [],
    updated: [],
    skipped: [],
  };

  console.log('Checking for outdated dependencies...\n');

  // 1. Get outdated packages
  const outdatedResult = await runCommand('npm outdated --json 2>/dev/null || echo "{}"');
  let outdated;

  try {
    outdated = JSON.parse(outdatedResult.stdout || '{}');
  } catch (e) {
    console.log('No outdated dependencies found');
    return report;
  }

  const packages = Object.keys(outdated);
  console.log(`Found ${packages.length} outdated packages\n`);

  if (packages.length === 0) {
    return report;
  }

  // 2. Categorize updates by risk level
  const updates = packages.map(name => {
    const pkg = outdated[name];
    const currentMajor = parseInt(pkg.current?.split('.')[0] || '0');
    const latestMajor = parseInt(pkg.latest?.split('.')[0] || '0');

    return {
      name,
      current: pkg.current,
      wanted: pkg.wanted,
      latest: pkg.latest,
      isMajor: latestMajor > currentMajor,
      risk: latestMajor > currentMajor ? 'high' : 'low',
    };
  });

  // Sort: low risk first
  updates.sort((a, b) => {
    if (a.risk === b.risk) return 0;
    return a.risk === 'low' ? -1 : 1;
  });

  console.log('Update plan:');
  updates.forEach(u => {
    console.log(`  ${u.risk === 'high' ? '⚠️' : '✓'} ${u.name}: ${u.current} → ${u.latest}`);
  });

  // 3. Save original package.json and package-lock.json
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');

  const originalPkgJson = await fs.readFile(pkgJsonPath, 'utf-8');
  let originalLock;
  try {
    originalLock = await fs.readFile(lockPath, 'utf-8');
  } catch (e) {
    // Lock file might not exist
  }

  // 4. Update packages one at a time (low risk only for safety)
  const safeUpdates = updates.filter(u => u.risk === 'low').slice(0, 5);

  for (const update of safeUpdates) {
    console.log(`\nUpdating ${update.name}...`);

    // Update the package
    const updateResult = await runCommand(`npm update ${update.name}`);

    if (!updateResult.success) {
      console.log(`Failed to update ${update.name}`);
      report.skipped.push({ name: update.name, reason: 'Update failed' });
      continue;
    }

    // Run tests
    console.log('Running tests...');
    const testResult = await runTests();

    if (testResult.success) {
      console.log(`✓ ${update.name} updated successfully`);
      report.updated.push({
        name: update.name,
        from: update.current,
        to: update.latest,
      });
      report.changes.push(`Updated ${update.name}: ${update.current} → ${update.latest}`);
    } else {
      console.log(`✗ Tests failed after updating ${update.name}, rolling back`);
      report.skipped.push({ name: update.name, reason: 'Tests failed' });

      // Rollback this specific package
      await fs.writeFile(pkgJsonPath, originalPkgJson);
      if (originalLock) {
        await fs.writeFile(lockPath, originalLock);
      }
      await runCommand('npm install');
    }
  }

  // 5. Report on high-risk (major) updates
  const majorUpdates = updates.filter(u => u.risk === 'high');
  if (majorUpdates.length > 0) {
    console.log('\n⚠️ Major updates available (manual review required):');
    majorUpdates.forEach(u => {
      console.log(`  ${u.name}: ${u.current} → ${u.latest}`);
    });
    report.skipped.push(...majorUpdates.map(u => ({
      name: u.name,
      reason: 'Major version update requires manual review',
    })));
  }

  // Summary
  console.log('\n=== UPDATE SUMMARY ===');
  console.log(`Updated: ${report.updated.length}`);
  console.log(`Skipped: ${report.skipped.length}`);

  return report;
}
