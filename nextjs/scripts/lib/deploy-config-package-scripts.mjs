import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkPackageScriptContracts({ scripts, nextRoot, requireScript, fail }) {
  const checkScript = requireScript(scripts, 'check', 'npm run typecheck:themes');
  for (const token of ['check:php-vendors', 'check:php-syntax', 'check:file-size']) {
    if (!checkScript.includes(token)) {
      fail(`package.json script check must include ${token}`);
    }
  }

  requireScript(scripts, 'package:theme', 'check-install-theme-package-context.mjs');
  requireScript(scripts, 'package:nextjs_default', 'npm run package:theme');
  requireScript(scripts, 'package:themes', 'npm run package:theme');

  const packageContextPath = join(nextRoot, 'scripts', 'check-install-theme-package-context.mjs');
  if (!existsSync(packageContextPath)) {
    fail('scripts/check-install-theme-package-context.mjs is missing');
    return;
  }

  const source = readFileSync(packageContextPath, 'utf8');
  for (const token of ['overlay', 'themeDir', 'public package root', 'build:vercel:<theme>']) {
    if (!source.includes(token)) {
      fail(`check-install-theme-package-context.mjs is missing package context guard token ${token}`);
    }
  }
}
