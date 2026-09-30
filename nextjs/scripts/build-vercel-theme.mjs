import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assertThemeSource, nextRoot, resolveThemePair } from './theme-pair.mjs';

function optionValue(args, name) {
  const longName = `--${name}`;
  const index = args.indexOf(longName);
  if (index >= 0) return args[index + 1] ?? '';

  const prefix = `${longName}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    pair: resolveThemePair({
      source: optionValue(args, 'source').trim() || undefined,
      theme: optionValue(args, 'name').trim() || undefined,
    }),
    runtime: resolveRuntime(optionValue(args, 'runtime').trim() || process.env.G5_NEXT_RUNTIME || 'server'),
  };
}

function resolveRuntime(value) {
  if (value === 'server' || value === 'static') return value;
  throw new Error(`Unsupported Vercel build runtime ${value}. Use server or static.`);
}

let pair;
let runtime;
try {
  ({ pair, runtime } = parseArgs());
  assertThemeSource(pair.source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

for (const dirname of ['.next', 'out']) {
  const target = join(nextRoot, dirname);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`[build-vercel-theme] Removed ${dirname}`);
  }
}

console.log(
  `[build-vercel-theme] Building source=${pair.source}, theme=${pair.theme}, runtime=${runtime}, output=/`
);

const buildEnv = {
  ...process.env,
  G5_NEXT_RUNTIME: runtime,
  G5_THEME_SOURCE: pair.source,
  G5_THEME_NAME: pair.theme,
  // Vercel 은 out/ 을 PHP 브리지 없이 그대로 서빙한다. 이식형 빌드의 자리표시 경로(/__g5base__)를
  // 바꿔 줄 곳이 없어 스크립트가 하나도 안 실리므로(본문이 숨은 채 멈춘다), Vercel 정적 빌드는
  // 사이트 고정형으로 굽는다. 그누보드 테마 설치용 빌드(build:theme)는 그대로 이식형이다.
  ...(runtime === 'static' ? { G5_PORTABLE_BUILD: '0' } : {}),
};

const doctor = spawnSync(
  process.execPath,
  [
    join(nextRoot, 'scripts', 'check-deploy-config.mjs'),
    '--mode',
    runtime === 'static' ? 'static' : 'vercel',
    '--require-env',
    '--source',
    pair.source,
    '--name',
    pair.theme,
  ],
  {
    cwd: nextRoot,
    env: buildEnv,
    shell: false,
    stdio: 'inherit',
  }
);

if (doctor.error) {
  console.error(doctor.error);
  process.exit(1);
}
if ((doctor.status ?? 1) !== 0) {
  process.exit(doctor.status ?? 1);
}

const result = spawnSync('npm', ['run', 'build'], {
  cwd: nextRoot,
  env: buildEnv,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
