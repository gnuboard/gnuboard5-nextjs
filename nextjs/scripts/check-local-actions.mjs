import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionScripts, assertActionScriptList } from './lib/local-action-scripts.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const maxRetries = Number.parseInt(process.env.LOCAL_ACTION_CHECK_RETRIES || '1', 10);

function fail(message) {
  console.error(`[check-local-actions] ${message}`);
  process.exit(1);
}

assertActionScriptList(scriptDir, fail);

function retryCount() {
  return Number.isFinite(maxRetries) && maxRetries > 0 ? maxRetries : 0;
}

function runScript(script) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> npm run ${script}`);
    const child = spawn('npm', ['run', script], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${script} failed with ${reason}`));
    });
  });
}

for (const script of actionScripts) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await runScript(script);
      break;
    } catch (error) {
      if (attempt >= retryCount()) {
        throw error;
      }
      console.warn(
        `[check-local-actions] ${script} failed; retrying (${attempt + 1}/${retryCount()})`
      );
    }
  }
}

console.log('\n[check-local-actions] all local action checks passed');
