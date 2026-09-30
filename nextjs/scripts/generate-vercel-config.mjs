import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createVercelConfig, formatVercelConfig } from './vercel-config.mjs';
import { nextRoot } from './theme-pair.mjs';

const runtime = optionValue('--runtime') || process.env.G5_VERCEL_CONFIG_RUNTIME || 'server';
const outputFile = optionValue('--output') || 'vercel.json';
const vercelJsonPath = join(nextRoot, outputFile);
const expected = formatVercelConfig(createVercelConfig({ runtime }));
const checkOnly = process.argv.includes('--check');

function optionValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] || '';

  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : '';
}

if (checkOnly) {
  const actual = existsSync(vercelJsonPath) ? readFileSync(vercelJsonPath, 'utf8') : '';
  if (actual.replace(/\r\n/g, '\n') !== expected) {
    console.error(
      `[generate-vercel-config] ${outputFile} is stale for ${runtime}. Run npm run generate:vercel-config.`
    );
    process.exit(1);
  }
  console.log(`[generate-vercel-config] ${outputFile} is up to date (${runtime})`);
  process.exit(0);
}

writeFileSync(vercelJsonPath, expected);
console.log(`[generate-vercel-config] wrote ${outputFile} (${runtime})`);
