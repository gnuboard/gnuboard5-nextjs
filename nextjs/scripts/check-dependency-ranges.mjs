import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextRoot } from './theme-pair.mjs';

const packageJsonPath = join(nextRoot, 'package.json');
const packageLockPath = join(nextRoot, 'package-lock.json');
const exactVersionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies'];
const errors = [];

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function isExactDependencySpec(spec) {
  if (exactVersionPattern.test(spec)) return true;

  if (spec.startsWith('npm:')) {
    const version = spec.slice(spec.lastIndexOf('@') + 1);
    return exactVersionPattern.test(version);
  }

  return false;
}

function checkSection(source, label, sectionName) {
  const section = source?.[sectionName];
  if (!section || typeof section !== 'object' || Array.isArray(section)) return;

  for (const [name, spec] of Object.entries(section)) {
    if (typeof spec !== 'string' || !isExactDependencySpec(spec)) {
      errors.push(`${label} ${sectionName}.${name} must use an exact version, found "${spec}"`);
    }
  }
}

const packageJson = readJson(packageJsonPath, 'package.json');
const packageLock = readJson(packageLockPath, 'package-lock.json');
const lockRoot = packageLock?.packages?.[''] || {};

for (const section of dependencySections) {
  checkSection(packageJson, 'package.json', section);
  checkSection(lockRoot, 'package-lock.json root package', section);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[check-dependency-ranges] ${error}`);
  }
  process.exit(1);
}

console.log('[check-dependency-ranges] dependencies use exact versions');
