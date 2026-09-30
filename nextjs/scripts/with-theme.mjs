import { spawnSync } from 'node:child_process';
import { resolveThemePair } from './theme-pair.mjs';

function fail(message) {
  console.error(`[with-theme] ${message}`);
  console.error('Usage: node scripts/with-theme.mjs <theme-name> <command> [...args]');
  console.error('   or: node scripts/with-theme.mjs --source <theme-source> --name <theme-name> -- <command> [...args]');
  process.exit(1);
}

function optionValue(args, name) {
  const longName = `--${name}`;
  const index = args.indexOf(longName);
  if (index >= 0) {
    return args[index + 1] ?? '';
  }

  const prefix = `${longName}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

function parseArgs() {
  const args = process.argv.slice(2);
  const separatorIndex = args.indexOf('--');

  if (args.some((arg) => arg === '--source' || arg.startsWith('--source=') || arg === '--name' || arg.startsWith('--name='))) {
    const optionArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
    const commandArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];
    const pair = resolveThemePair({
      source: optionValue(optionArgs, 'source').trim() || undefined,
      theme: optionValue(optionArgs, 'name').trim() || undefined,
    });

    return {
      themeName: pair.theme,
      themeSource: pair.source,
      command: commandArgs[0],
      args: commandArgs.slice(1),
    };
  }

  const [themeName, command, ...commandArgs] = args;
  const pair = resolveThemePair({ theme: themeName });
  return {
    themeName: pair.theme,
    themeSource: pair.source,
    command,
    args: commandArgs,
  };
}

let parsedArgs;
try {
  parsedArgs = parseArgs();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const { themeName, themeSource, command, args } = parsedArgs;
const usesShell = process.platform === 'win32' && command === 'npm';

if (!command) {
  fail('Missing command to run.');
}

const result = spawnSync(command, args, {
  env: {
    ...process.env,
    G5_THEME_NAME: themeName,
    G5_THEME_SOURCE: themeSource,
  },
  shell: usesShell,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
