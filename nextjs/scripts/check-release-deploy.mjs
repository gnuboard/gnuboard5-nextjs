import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nextRoot = resolve(scriptDir, '..');
const args = process.argv.slice(2);
const includeActions = args.includes('--include-actions') || process.env.G5_RELEASE_INCLUDE_ACTIONS === '1';

const stages = [
  {
    name: 'preflight',
    description: 'source/public package branch and sync guards',
    scripts: [
      'check:release:setup',
      'check:source-branch',
      'check:public-branches:strict',
      'check:public-package-sync',
    ],
  },
  {
    name: 'quality',
    description: 'type, lint, unit, policy, audit, and source guards',
    scripts: ['check:code'],
  },
  {
    name: 'ui',
    description: 'local theme UI, accessibility, and required auth smoke checks',
    scripts: ['check:ui:release'],
  },
  {
    name: 'vercel',
    description: 'strict Vercel server/static build and smoke gate',
    scripts: ['check:release:vercel:strict'],
  },
  {
    name: 'actions-safe',
    description: 'non-mutating local action check contract smoke',
    scripts: ['check:release:actions:safe'],
  },
  {
    name: 'actions',
    description: 'stateful local auth/shop/order action checks',
    scripts: ['check:release:actions'],
    optional: true,
  },
];

function fail(message) {
  console.error(`[check-release-deploy] ${message}`);
  process.exit(1);
}

function valuesFor(prefix) {
  return args
    .filter((arg) => arg === prefix || arg.startsWith(`${prefix}=`))
    .flatMap((arg) => {
      const inline = arg.startsWith(`${prefix}=`) ? arg.slice(prefix.length + 1) : '';
      return inline
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    });
}

function stageNamesFromFlags(prefix) {
  return args
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length))
    .filter(Boolean);
}

function selectedStages() {
  const known = new Set(stages.map((stage) => stage.name));
  const only = [
    ...valuesFor('--only'),
    ...stageNamesFromFlags('--only-'),
  ];
  const skip = new Set([
    ...valuesFor('--skip'),
    ...stageNamesFromFlags('--skip-'),
  ]);

  for (const name of [...only, ...skip]) {
    if (!known.has(name)) {
      fail(`Unknown stage "${name}". Expected one of: ${[...known].join(', ')}`);
    }
  }

  return stages.filter((stage) => {
    if (only.length > 0 && !only.includes(stage.name)) return false;
    if (only.length === 0 && stage.optional && !includeActions) return false;
    return !skip.has(stage.name);
  });
}

function runNpmScript(script) {
  console.log(`\n[check-release-deploy] npm run ${script}`);
  const result = spawnSync('npm', ['run', script], {
    cwd: nextRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    fail(result.error.message);
  }

  const status = result.status ?? 1;
  if (status !== 0) {
    process.exit(status);
  }
}

const queue = selectedStages();
if (queue.length === 0) {
  fail('No release stages selected.');
}

console.log(`[check-release-deploy] stages: ${queue.map((stage) => stage.name).join(', ')}`);
for (const stage of queue) {
  console.log(`\n[check-release-deploy] stage ${stage.name}: ${stage.description}`);
  for (const script of stage.scripts) {
    runNpmScript(script);
  }
}

console.log('\n[check-release-deploy] release deploy gate passed');
