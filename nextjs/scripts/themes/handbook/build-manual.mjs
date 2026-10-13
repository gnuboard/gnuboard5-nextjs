/**
 * 매뉴얼 사이트(handbook 테마를 쓰는 다른 폴더의 그누보드) 배포용 빌드.
 *
 * 1) handbook 테마를 매뉴얼 사이트의 API 주소로 정적 빌드하고
 * 2) 산출물(out/)을 그 사이트의 theme/handbook/app 으로 옮긴 뒤
 * 3) 파일 수가 같은지 확인한다.
 *
 * npm run build:handbook 을 쓰지 않는 이유: 그쪽은 이 저장소의 theme/handbook/app
 * 을 대상으로 동기화한다. 매뉴얼 사이트는 다른 폴더에 있다.
 *
 * 사용: G5_MANUAL_SITE_URL=https://manual.example.com G5_MANUAL_SITE_PATH=/var/www/manual npm run build:manual
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// 어느 사이트에 넣을지는 늘 정해서 부른다 — 기본값으로 엉뚱한 폴더를 덮지 않게.
const SITE_URL = (process.env.G5_MANUAL_SITE_URL || '').trim();
const SITE_PATH_INPUT = (process.env.G5_MANUAL_SITE_PATH || '').trim();
if (!SITE_URL || !SITE_PATH_INPUT) {
  console.error('[build-manual] G5_MANUAL_SITE_URL(사이트 주소)와 G5_MANUAL_SITE_PATH(그누보드 폴더)를 정하세요.');
  process.exit(1);
}
const SITE_PATH = resolve(SITE_PATH_INPUT);

const here = dirname(fileURLToPath(import.meta.url));
// scripts/themes/handbook/ 에 둔다 — 테마 전용 스크립트는 공개 배포판에서 테마째 빠진다.
const nextRoot = resolve(here, '..', '..', '..');
const outDir = join(nextRoot, 'out');
const appDir = join(SITE_PATH, 'theme', 'handbook', 'app');

function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(full) : statSync(full).isFile() ? 1 : 0;
  }
  return total;
}

if (!existsSync(SITE_PATH)) {
  console.error(`[build-manual] 사이트 폴더가 없습니다: ${SITE_PATH}`);
  console.error('  G5_MANUAL_SITE_PATH 로 위치를 지정하세요.');
  process.exit(1);
}

const SKIP_CHECKS = process.argv.includes('--skip-checks');

console.log(`[build-manual] site=${SITE_URL}`);
console.log(`[build-manual] path=${SITE_PATH}`);

/** 배포 대상 폴더를 건드리기 전에 돌린다. 실패하면 배포하지 않는다. */
function runCheck(label, command, args) {
  process.stdout.write(`[build-manual] ${label} … `);
  const result = spawnSync(command, args, {
    cwd: nextRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    console.log('통과');
    return;
  }

  console.log('실패');
  console.error((result.stdout || '') + (result.stderr || ''));
  console.error(`[build-manual] ${label} 에서 멈췄습니다. 배포하지 않습니다.`);
  console.error('[build-manual] 검사를 건너뛰려면 --skip-checks 를 주세요(권장하지 않음).');
  process.exit(result.status ?? 1);
}

if (SKIP_CHECKS) {
  console.log('[build-manual] 검사 건너뜀 (--skip-checks)');
} else {
  runCheck('타입 검사', 'npm', ['run', 'typecheck:handbook']);
  runCheck('린트', 'npx', ['eslint', 'themes/handbook']);
}

// 내보내기 단계가 out/ 을 스스로 지우다 Windows 에서 EBUSY 로 멈추는 일이 잦다
// (긴 경로 + 바이러스 검사/색인이 핸들을 쥐고 있는 사이). 미리 지워 두고 시작한다.
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 400 });
}

const build = spawnSync(
  process.execPath,
  [join(here, '..', '..', 'with-theme.mjs'), '--source', 'handbook', '--name', 'handbook', '--', 'npm', 'run', 'build'],
  {
    stdio: 'inherit',
    cwd: nextRoot,
    env: {
      ...process.env,
      G5_API_INTERNAL_URL: `${SITE_URL}/api/v1`,
      // 매뉴얼 사이트는 주소가 하나로 정해진 루트 설치라, 휴대용 빌드에서도 글을 미리 굽는다.
      // 공개 URL 은 그대로 자리표시자로 남아 브리지가 채운다.
      G5_PORTABLE_PRERENDER_API_URL: `${SITE_URL}/api/v1`,
      NEXT_PUBLIC_API_URL: `${SITE_URL}/api/v1`,
      NEXT_PUBLIC_G5_URL: SITE_URL,
      NEXT_PUBLIC_APP_URL: SITE_URL,
    },
  }
);

if (build.status !== 0) {
  console.error('[build-manual] 빌드 실패. 배포하지 않습니다.');
  process.exit(build.status ?? 1);
}

if (!existsSync(outDir)) {
  console.error(`[build-manual] 산출물이 없습니다: ${outDir}`);
  process.exit(1);
}

// 지운 파일이 남지 않도록 통째로 교체한다. app/ 은 빌드 산출물이라 안전하다.
rmSync(appDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 400 });
mkdirSync(appDir, { recursive: true });
cpSync(outDir, appDir, { recursive: true });

const built = countFiles(outDir);
const deployed = countFiles(appDir);
console.log(`[build-manual] out=${built} → app=${deployed}`);

if (built !== deployed) {
  console.error('[build-manual] 파일 수가 다릅니다. 배포가 불완전합니다.');
  process.exit(1);
}

// 배포한 화면이 실제로 응답하는지 본다. 파일만 옮겨 놓고 500 이 나는 경우가 있다.
const probes = ['/', '/manual2', '/dev_manual'];
let reachable = 0;

for (const path of probes) {
  try {
    const response = await fetch(`${SITE_URL}${path}`, { redirect: 'follow' });
    const mark = response.ok ? 'ok' : `HTTP ${response.status}`;
    console.log(`[build-manual] ${path} → ${mark}`);
    if (response.ok) reachable += 1;
  } catch (error) {
    console.log(`[build-manual] ${path} → 응답 없음 (${error instanceof Error ? error.message : error})`);
  }
}

if (reachable === 0) {
  console.error('[build-manual] 배포는 됐지만 사이트가 응답하지 않습니다. 웹서버와 테마 설정을 확인하세요.');
  process.exit(1);
}

console.log(`[build-manual] 완료. ${SITE_URL} 에서 확인하세요.`);
