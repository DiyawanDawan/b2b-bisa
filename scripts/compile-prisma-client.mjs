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

function copyJsFiles(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyJsFiles(from, to);
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.js.map')) {
      fs.copyFileSync(from, to);
    }
  }
}

copyJsFiles(outDir, srcDir);

if (!fs.existsSync(path.join(srcDir, 'client.js'))) {
  console.error('Failed to emit generated/prisma/client.js');
  process.exit(1);
}

console.log('Compiled Prisma client → generated/prisma/client.js');
