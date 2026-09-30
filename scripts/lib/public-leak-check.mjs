import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/**
 * 공개판 누출 검사 — 동기화가 끝난 공개 저장소에서 비공개 테마 이름과 로컬 개발 흔적을 찾는다.
 * 파일 내용과 경로(폴더 · 파일 이름) 둘 다 본다. 하나라도 있으면 목록을 돌려주고, 동기화는 실패한다.
 *
 * 비공개 테마 이름은 원본 매니페스트에서 온다(publicPackage 가 true 가 아닌 테마). 이 파일에는 적지 않는다.
 */

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.conf', '.css', '.example', '.html', '.js', '.json', '.md', '.mjs', '.php',
  '.sql', '.svg', '.ts', '.tsx', '.txt', '.webmanifest', '.xml', '.yml', '.yaml',
]);

const SKIP_DIRS = new Set([
  '.git', '.next', '.vercel', 'node_modules', 'out', 'dist', 'test-results', '.g5-next-build-work',
  '.screenshots', 'playwright-report',
]);

/** 로컬 개발 환경 흔적 — 공개판에 남으면 남의 PC 경로 · 로컬 가상호스트가 드러난다. */
export const LOCAL_TRACE_PATTERNS = [
  { label: 'local Windows path', regex: /[A-Za-z]:[\\/]+(?:xampp|laragon|Users[\\/]+kagla)/i },
  // 로컬 사이트 폴더(gnu_theme2, gnu_56391 …). 비공개 테마 이름이 붙은 폴더는 테마 이름 검사가 잡는다.
  { label: 'local site folder', regex: /\bgnu_(?:theme\d*|\d{4,})\b/i },
  { label: 'local vhost address', regex: /\b127\.0\.0\.(?!1\b)\d{1,3}\b/ },
];

function isTextFile(path) {
  const ext = extname(path).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const name = path.split(/[\\/]/).pop() || '';
  return name.startsWith('.env') || name === '.htaccess' || name === '.gitignore';
}

function walk(root, visit) {
  if (!existsSync(root)) return;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (SKIP_DIRS.has(entry) || entry.startsWith('.sync-preserve-')) continue;
        stack.push(join(current, entry));
      }
    } else if (stat.isFile()) {
      visit(current);
    }
  }
}

/**
 * @param {string} repoRoot 공개 저장소 루트
 * @param {{ privateTokens: string[], scanRoots?: string[], ignoreFiles?: string[] }} options
 * @returns {string[]} "경로:줄: 이유" 목록 (비어 있으면 통과)
 */
export function findPublicLeaks(repoRoot, { privateTokens, scanRoots = ['.'], ignoreFiles = [], extraPatterns = [] }) {
  const tokenPatterns = privateTokens.map((token) => ({
    label: `private theme "${token}"`,
    regex: new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  }));
  const patterns = [...tokenPatterns, ...LOCAL_TRACE_PATTERNS, ...extraPatterns];
  const leaks = [];

  for (const scanRoot of scanRoots) {
    walk(join(repoRoot, scanRoot), (file) => {
      const rel = relative(repoRoot, file).replaceAll('\\', '/');
      if (ignoreFiles.includes(rel)) return;

      for (const { label, regex } of tokenPatterns) {
        if (regex.test(rel)) leaks.push(`${rel}: path contains ${label}`);
      }
      if (!isTextFile(file) || statSync(file).size > 2 * 1024 * 1024) return;

      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const { label, regex } of patterns) {
          if (regex.test(line)) leaks.push(`${rel}:${index + 1}: ${label}`);
        }
      });
    });
  }

  return leaks;
}
