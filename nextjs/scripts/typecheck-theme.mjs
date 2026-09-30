import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertThemeSource, resolveThemePair } from './theme-pair.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const { source } = resolveThemePair();
assertThemeSource(source);
const tempTsconfig = join(nextRoot, '.g5-tsconfig-typecheck.json');

function tscBin() {
  return join(nextRoot, 'node_modules', 'typescript', 'bin', 'tsc');
}

const config = {
  extends: './tsconfig.json',
  compilerOptions: {
    paths: {
      '@/*': ['./src/*'],
      '@g5-theme/*': [`./themes/${source}/*`],
    },
  },
  include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
  exclude: ['node_modules'],
};

try {
  writeFileSync(tempTsconfig, `${JSON.stringify(config, null, 2)}\n`);
  const result = spawnSync(process.execPath, [tscBin(), '--noEmit', '--incremental', 'false', '--project', tempTsconfig], {
    cwd: nextRoot,
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[typecheck-theme] ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (existsSync(tempTsconfig)) {
    unlinkSync(tempTsconfig);
  }
}
