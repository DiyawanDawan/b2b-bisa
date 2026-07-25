/**
 * Repairs node_modules entries that npm extracted incompletely on this machine.
 * Downloads the version pinned in package-lock.json and extracts it with `tar`,
 * which succeeds where npm's own extractor intermittently fails here.
 *
 * Usage: node scripts/repair-node-modules.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const platform = process.platform;

const missing = [];
for (const [modulePath, info] of Object.entries(lock.packages)) {
  if (!modulePath.startsWith('node_modules/')) continue;
  if (modulePath.split('node_modules/').length > 2) continue;
  if (info.link || info.optional) continue;
  if (info.os && !info.os.includes(platform)) continue;
  if (fs.existsSync(path.join(modulePath, 'package.json'))) continue;
  missing.push({
    name: modulePath.slice('node_modules/'.length),
    version: info.version,
    modulePath,
  });
}

if (missing.length === 0) {
  console.log('node_modules is complete; nothing to repair.');
  process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-modules-'));
let repaired = 0;
const failed = [];

for (const { name, version, modulePath } of missing) {
  try {
    const output = execFileSync(
      'npm',
      ['pack', `${name}@${version}`, '--silent', '--no-audit', '--no-fund'],
      { cwd: tmpDir, encoding: 'utf8', shell: true },
    );
    const tarball = output.trim().split('\n').pop().trim();
    fs.mkdirSync(modulePath, { recursive: true });
    execFileSync(
      'tar',
      ['-xzf', path.join(tmpDir, tarball), '-C', modulePath, '--strip-components=1'],
      { stdio: 'ignore' },
    );
    fs.rmSync(path.join(tmpDir, tarball), { force: true });
    repaired += 1;
    console.log(`repaired ${name}@${version}`);
  } catch (error) {
    failed.push(`${name}@${version}: ${error.message.split('\n')[0]}`);
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nrepaired ${repaired}/${missing.length}`);
if (failed.length > 0) {
  console.log('failed:\n' + failed.join('\n'));
  process.exit(1);
}
