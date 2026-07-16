import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * tsc (moduleResolution bundler) keeps extensionless relative imports.
 * Node ESM requires explicit .js — rewrite after emit.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distSrc = path.join(root, 'dist', 'src');

function listJs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJs(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function resolveRelative(fromFile, spec) {
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
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(
    /(from\s+|import\s*\(\s*|export\s+\*\s+from\s+)(["'])(\.[^"']+)\2/g,
    (match, prefix, quote, spec) => {
      const fixed = resolveRelative(file, spec);
      if (!fixed || fixed === spec) return match;
      return `${prefix}${quote}${fixed}${quote}`;
    },
  );
  if (updated !== original) {
    fs.writeFileSync(file, updated);
    return true;
  }
  return false;
}

const files = listJs(distSrc);
let changed = 0;
for (const file of files) {
  if (rewriteFile(file)) changed += 1;
}

console.log(`Fixed ESM relative imports in ${changed}/${files.length} dist JS files.`);
