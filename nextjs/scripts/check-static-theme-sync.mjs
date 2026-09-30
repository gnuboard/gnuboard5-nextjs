import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_NAME } from './theme-name.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const repoRoot = resolve(nextRoot, '..');
const outDir = join(nextRoot, 'out');
const themeAppDir = join(repoRoot, 'theme', THEME_NAME, 'app');

function fail(message, details = []) {
  console.error(`[check-static-theme-sync] ${message}`);
  for (const detail of details.slice(0, 40)) {
    console.error(`  - ${detail}`);
  }
  if (details.length > 40) {
    console.error(`  ... and ${details.length - 40} more`);
  }
  process.exit(1);
}

function listFiles(root) {
  if (!existsSync(root)) {
    fail(`Missing directory: ${root}`);
  }

  const files = [];
  const stack = [''];
  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = join(root, current);
    for (const entry of readdirSync(absolute)) {
      const relPath = current ? join(current, entry) : entry;
      const entryPath = join(root, relPath);
      const stat = statSync(entryPath);
      if (stat.isDirectory()) {
        stack.push(relPath);
      } else if (stat.isFile()) {
        files.push(relPath.replaceAll('\\', '/'));
      }
    }
  }

  return files.sort();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const outFiles = listFiles(outDir);
const themeFiles = listFiles(themeAppDir);
const outSet = new Set(outFiles);
const themeSet = new Set(themeFiles);

const missing = outFiles.filter((file) => !themeSet.has(file));
const extra = themeFiles.filter((file) => !outSet.has(file));
const changed = outFiles.filter((file) => {
  if (!themeSet.has(file)) return false;
  return sha256(join(outDir, file)) !== sha256(join(themeAppDir, file));
});

const problems = [
  ...missing.map((file) => `missing in theme: ${file}`),
  ...extra.map((file) => `extra in theme: ${file}`),
  ...changed.map((file) => `content differs: ${file}`),
];

if (problems.length > 0) {
  fail(
    `${relative(repoRoot, themeAppDir)} is not synced with ${relative(repoRoot, outDir)}. Run npm run build:theme.`,
    problems
  );
}

console.log(
  `[check-static-theme-sync] ${relative(repoRoot, themeAppDir)} matches ${relative(repoRoot, outDir)} (${outFiles.length} files)`
);
