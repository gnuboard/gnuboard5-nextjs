import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  actionScripts,
  assertActionScriptList,
  scriptToActionFile,
} from './lib/local-action-scripts.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const packageJson = JSON.parse(readFileSync(join(nextRoot, 'package.json'), 'utf8'));
const scripts = packageJson.scripts || {};

function fail(message) {
  console.error(`[check-local-actions-safe] ${message}`);
  process.exitCode = 1;
}

assertActionScriptList(scriptDir, fail);

if (!scripts['check:local-actions:all']?.includes('scripts/check-local-actions.mjs')) {
  fail('package.json script check:local-actions:all must run scripts/check-local-actions.mjs');
}

for (const script of actionScripts) {
  const file = scriptToActionFile(script);
  const command = scripts[script] || '';
  if (!command.includes(`scripts/${file}`)) {
    fail(`package.json script ${script} must run scripts/${file}`);
  }
  if (!existsSync(join(scriptDir, file))) {
    fail(`scripts/${file} is missing`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[check-local-actions-safe] ${actionScripts.length} action check script contract(s) passed`);
