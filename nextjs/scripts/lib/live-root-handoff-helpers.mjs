import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function env(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function shellAssignments(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join(' ');
}

export function readExpectedArchiveSha(archiveChecksumPath) {
  if (!existsSync(archiveChecksumPath)) {
    return '';
  }

  const [hash] = readFileSync(archiveChecksumPath, 'utf8').trim().split(/\s+/);
  return hash || '';
}

export function readJsonFile(path, label, fail) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Could not read ${label}: ${error.message}`);
  }
}

export function parseRemoteJson(result, label) {
  if (!result.ok) {
    return { ok: false, detail: result.stderr.trim() || `exit ${result.status}` };
  }

  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, detail: `${label} is not valid JSON: ${error.message}` };
  }
}

export function missingTokens(output, tokens) {
  return tokens.filter((token) => !output.includes(token));
}

export function manifestDetail(manifest) {
  return `${manifest.gitCommit || 'unknown'} ${manifest.generatedAt || 'unknown'}`;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    error: result.error,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function parseIncludeStatus(output) {
  const rows = [];
  let inStatusBlock = false;

  for (const line of output.split(/\r?\n/)) {
    if (line.trim() === 'Current include status:') {
      inStatusBlock = true;
      continue;
    }

    if (inStatusBlock && (line.trim() === '' || line.startsWith('Copy snippets as root:'))) {
      break;
    }

    if (!inStatusBlock) {
      continue;
    }

    const match = line.match(/^\s{2}(.+?)\s{2,}(.+?)\s*$/);
    if (match) {
      rows.push({ check: match[1].trim(), status: match[2].trim() });
    }
  }

  return rows;
}

export function webRootChecksumCommand({ packageDir, webRoot, packagePrefix, targetPrefix }) {
  return [
    `cd ${quote(packageDir)}`,
    `${shellAssignments({
      WEB_ROOT: webRoot,
      PACKAGE_PREFIX: packagePrefix,
      TARGET_PREFIX: targetPrefix,
    })} php <<'PHP'
<?php
$webRoot = rtrim((string) getenv('WEB_ROOT'), '/');
$packagePrefix = (string) getenv('PACKAGE_PREFIX');
$targetPrefix = (string) getenv('TARGET_PREFIX');
$checksumFile = __DIR__ . '/CHECKSUMS.sha256';

if ($webRoot === '' || $packagePrefix === '' || $targetPrefix === '') {
    fwrite(STDERR, "missing checksum environment\n");
    exit(1);
}

if (!is_file($checksumFile)) {
    fwrite(STDERR, "missing CHECKSUMS.sha256\n");
    exit(1);
}

$checked = 0;
$handle = fopen($checksumFile, 'rb');
if (!$handle) {
    fwrite(STDERR, "could not open CHECKSUMS.sha256\n");
    exit(1);
}

while (($line = fgets($handle)) !== false) {
    $line = trim($line);
    if ($line === '' || !preg_match('/^([a-f0-9]{64})\s+(.+)$/', $line, $match)) {
        continue;
    }

    $expected = $match[1];
    $packagePath = str_replace('\\\\', '/', $match[2]);
    if (strpos($packagePath, $packagePrefix) !== 0) {
        continue;
    }

    $relative = substr($packagePath, strlen($packagePrefix));
    $target = $webRoot . '/' . $targetPrefix . $relative;

    if (!is_file($target)) {
        fwrite(STDERR, "missing live file: {$target}\n");
        exit(1);
    }

    $actual = hash_file('sha256', $target);
    if ($actual !== $expected) {
        fwrite(STDERR, "checksum mismatch: {$target}\nexpected {$expected}\nactual   {$actual}\n");
        exit(1);
    }

    $checked++;
}

fclose($handle);

if ($checked === 0) {
    fwrite(STDERR, "no checksum entries matched {$packagePrefix}\n");
    exit(1);
}

echo $checked . PHP_EOL;
PHP`,
  ].join(' && ');
}
