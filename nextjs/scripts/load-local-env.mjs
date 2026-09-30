import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const ENV_LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;
const initialEnvKeys = new Set(Object.keys(process.env));

function parseValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, '');
}

export function loadLocalEnv(rootDir, options = {}) {
  const lockedKeys = options.lockedKeys || initialEnvKeys;
  const envFiles = options.files || ['.env', '.env.production', '.env.local', '.env.production.local'];

  for (const file of envFiles) {
    const envPath = isAbsolute(file) ? file : join(rootDir, file);
    if (!existsSync(envPath)) continue;

    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const match = line.match(ENV_LINE_RE);
      if (!match) continue;

      const [, key, rawValue] = match;
      if (lockedKeys.has(key)) continue;
      process.env[key] = parseValue(rawValue);
    }
  }
}
