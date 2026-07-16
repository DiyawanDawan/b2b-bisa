import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'generated', 'prisma');
const outDir = path.join(root, 'generated', 'prisma-js');

if (!fs.existsSync(path.join(srcDir, 'client.ts'))) {
  console.error('Missing generated/prisma/client.ts — run prisma generate first.');
  process.exit(1);
}

execSync('npx tsc -p tsconfig.prisma.json', { cwd: root, stdio: 'inherit' });

function listFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function resolveRelativeSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  if (/\.(js|json|node|mjs|cjs)$/.test(spec)) return spec;

  const base = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(`${base}.js`)) return `${spec}.js`;
  if (fs.existsSync(path.join(base, 'index.js'))) {
    return spec.endsWith('/') ? `${spec}index.js` : `${spec}/index.js`;
  }
  return null;
}

function rewriteFile(file) {
  if (!file.endsWith('.js')) return;
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(
    /(from\s+|import\s*\(\s*|export\s+\*\s+from\s+)(["'])(\.[^"']+)\2/g,
    (match, prefix, quote, spec) => {
      const fixed = resolveRelativeSpecifier(file, spec);
      if (!fixed || fixed === spec) return match;
      return `${prefix}${quote}${fixed}${quote}`;
    },
  );
  if (updated !== original) fs.writeFileSync(file, updated);
}

function copyJsTree(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyJsTree(from, to);
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) {
      fs.copyFileSync(from, to);
    }
  }
}

copyJsTree(outDir, srcDir);

for (const file of listFiles(srcDir)) {
  rewriteFile(file);
}

if (!fs.existsSync(path.join(srcDir, 'client.js'))) {
  console.error('Failed to emit generated/prisma/client.js');
  process.exit(1);
}

console.log('Compiled Prisma client → generated/prisma/client.js (ESM paths fixed)');
