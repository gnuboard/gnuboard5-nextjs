import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { configuredThemePairs, repoRoot } from './theme-pair.mjs';

const MAX_FILE_BYTES = 1024 * 1024;
const SCANNED_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.php',
  '.sh',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const EXCLUDED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'out',
  'vendor',
]);
const EXCLUDED_PATH_PARTS = [
  'data/cache',
  'data/file',
  'data/log',
  'data/session',
  // 설치 테마의 빌드 산출물 — 테마 이름은 매니페스트에서 읽는다(이 파일에 비공개 테마를 적지 않는다).
  ...configuredThemePairs().map((pair) => `theme/${pair.theme}/app`),
  'nextjs/out',
  'nextjs/.next',
];
const SECRET_PATTERNS = [
  {
    name: 'private key block',
    regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |)?PRIVATE KEY-----/,
  },
  {
    name: 'AWS access key',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'GitHub token',
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/,
  },
  {
    name: 'GitHub fine-grained token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: 'Slack token',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
  },
  {
    name: 'Stripe live secret',
    regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/,
  },
];

function normalizedRelativePath(path) {
  return relative(repoRoot, path).replace(/\\/g, '/');
}

function shouldSkipDir(path) {
  const rel = normalizedRelativePath(path);
  const name = rel.split('/').pop();
  if (name && EXCLUDED_DIRS.has(name)) return true;

  return EXCLUDED_PATH_PARTS.some((part) => rel === part || rel.startsWith(`${part}/`));
}

function shouldScanFile(path) {
  const rel = normalizedRelativePath(path);
  if (EXCLUDED_PATH_PARTS.some((part) => rel === part || rel.startsWith(`${part}/`))) return false;
  if (!SCANNED_EXTENSIONS.has(extname(path))) return false;

  const stat = statSync(path);
  return stat.isFile() && stat.size <= MAX_FILE_BYTES;
}

function walk(dir) {
  if (!existsSync(dir) || shouldSkipDir(dir)) return [];

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && shouldScanFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

const findings = [];

for (const file of walk(repoRoot)) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          file: normalizedRelativePath(file),
          line: index + 1,
          pattern: pattern.name,
        });
      }
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`[check-secret-scan] ${finding.pattern} in ${finding.file}:${finding.line}`);
  }
  process.exit(1);
}

console.log('[check-secret-scan] no obvious committed secrets found');
