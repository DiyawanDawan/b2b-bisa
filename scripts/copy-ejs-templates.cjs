const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(appRoot, 'src', 'services', 'templates');
const targetDir = path.join(appRoot, 'dist', 'src', 'services', 'templates');

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(sourceDir)) {
  copyRecursive(sourceDir, targetDir);
  console.log(`Copied EJS templates to ${path.relative(appRoot, targetDir)}`);
} else {
  console.log('No EJS templates found to copy.');
}
