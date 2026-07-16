import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rewrite package.json "#alias" imports from ./src/*.ts → ./dist/src/*.js
 * so `node dist/src/index.js` does not load TypeScript sources at runtime.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (!pkg.imports || typeof pkg.imports !== 'object') {
  console.error('package.json has no imports map');
  process.exit(1);
}

let changed = 0;
for (const [key, value] of Object.entries(pkg.imports)) {
  if (typeof value !== 'string') continue;
  if (key === '#prisma') continue;

  let next = value;
  if (next.includes('/src/')) {
    next = next.replaceAll('/src/', '/dist/src/');
  }
  if (next.endsWith('.ts')) {
    next = `${next.slice(0, -3)}.js`;
  }
  if (next.includes('*.ts')) {
    next = next.replaceAll('*.ts', '*.js');
  }

  if (next !== value) {
    pkg.imports[key] = next;
    changed += 1;
    console.log(`  ${key}: ${value} → ${next}`);
  }
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Prepared ${changed} production import(s) for dist runtime.`);
