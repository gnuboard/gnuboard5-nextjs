import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function runPhpSeed(scriptName, args, env, label, fail) {
  const scriptPath = fileURLToPath(new URL(`../../scripts/${scriptName}`, import.meta.url));
  const result = spawnSync('php', [scriptPath, ...args], {
    env,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.error) {
    fail(`failed to run local smoke ${label} seed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`local smoke ${label} seed failed`, {
      status: result.status,
      stderr: result.stderr.trim(),
      stdout: result.stdout.trim(),
    });
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    fail(`local smoke ${label} seed returned invalid JSON`, {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }
}

function requireCredentials(payload, label, fail) {
  if (!payload?.success || !payload.id || !payload.password) {
    fail(`local smoke ${label} seed did not return credentials`, payload);
  }
  return {
    id: String(payload.id),
    password: String(payload.password),
  };
}

export function runLocalBrowserSeeds(options) {
  const { seedAuth, fail } = options;
  let { authId, authPassword } = options;

  if (seedAuth) {
    const payload = runPhpSeed(
      'seed_nextjs_smoke_user.php',
      ['--json'],
      {
        ...process.env,
        LOCAL_SMOKE_LOGIN_ID: authId || 'nextjs_smoke',
        LOCAL_SMOKE_LOGIN_PASSWORD: authPassword || 'NextjsSmoke123!',
      },
      'user',
      fail
    );
    ({ id: authId, password: authPassword } = requireCredentials(payload, 'user', fail));
  }

  return { authId, authPassword };
}
