import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sourceSnapshotDetail(manifest) {
  const snapshot = manifest?.sourceSnapshot;
  if (!snapshot) {
    return 'sourceSnapshot=(missing)';
  }

  return `sourceSnapshot=${snapshot.digest || 'unknown'} (${snapshot.fileCount || 'unknown'} file(s))`;
}

export function sourceSnapshotsMatch(left, right) {
  const leftSnapshot = left?.sourceSnapshot;
  const rightSnapshot = right?.sourceSnapshot;

  return Boolean(
    leftSnapshot &&
      rightSnapshot &&
      leftSnapshot.version === rightSnapshot.version &&
      leftSnapshot.algorithm === rightSnapshot.algorithm &&
      leftSnapshot.digest === rightSnapshot.digest &&
      leftSnapshot.fileCount === rightSnapshot.fileCount
  );
}

function normalizeRepoPath(path) {
  return String(path || '').trim().replaceAll('\\', '/');
}

function repoAbsolutePath(repoRoot, repoPath) {
  return join(repoRoot, ...repoPath.split('/').filter(Boolean));
}

function isPackageImpactingFile(file, packageImpactingPrefixes, packageImpactingFiles) {
  return packageImpactingFiles.has(file) || packageImpactingPrefixes.some((prefix) => file.startsWith(prefix));
}

function isExcludedSourceSnapshotPath(file) {
  if (!file.startsWith('api/')) {
    return false;
  }

  return file.split('/').some((part) => part === '.env' || part.startsWith('.env.'));
}

function collectSourceSnapshotFiles(repoRoot, dir) {
  const files = [];

  if (!existsSync(dir)) {
    return files;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceSnapshotFiles(repoRoot, entryPath));
      continue;
    }

    if (entry.isFile()) {
      const file = normalizeRepoPath(relative(repoRoot, entryPath));
      if (!isExcludedSourceSnapshotPath(file)) {
        files.push(file);
      }
    }
  }

  return files;
}

export function createSourceSnapshot({ repoRoot, packageImpactingPrefixes, packageImpactingFiles }) {
  const sourceFiles = new Set();

  for (const prefix of packageImpactingPrefixes) {
    for (const file of collectSourceSnapshotFiles(repoRoot, repoAbsolutePath(repoRoot, prefix))) {
      sourceFiles.add(file);
    }
  }

  for (const file of packageImpactingFiles) {
    if (!isExcludedSourceSnapshotPath(file) && existsSync(repoAbsolutePath(repoRoot, file))) {
      sourceFiles.add(file);
    }
  }

  const files = Array.from(sourceFiles).sort((a, b) => a.localeCompare(b));
  const digest = createHash('sha256');

  for (const file of files) {
    digest.update(`${sha256File(repoAbsolutePath(repoRoot, file))}  ${file}\n`, 'utf8');
  }

  return {
    version: 1,
    algorithm: 'sha256',
    digest: digest.digest('hex'),
    fileCount: files.length,
  };
}

function parseGitStatusPorcelainZ(output) {
  const records = output.split('\0');
  const files = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      continue;
    }

    const status = record.slice(0, 2);
    const file = normalizeRepoPath(record.slice(3));
    if (file) {
      files.push(file);
    }

    if (status.includes('R') || status.includes('C')) {
      index += 1;
      const originalFile = normalizeRepoPath(records[index] || '');
      if (originalFile) {
        files.push(originalFile);
      }
    }
  }

  return Array.from(new Set(files)).sort((a, b) => a.localeCompare(b));
}

export function packageImpactingDirtyFiles({ git, packageImpactingPrefixes, packageImpactingFiles }) {
  const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!status.ok) {
    return { ok: false, detail: status.stderr.trim() || `git status failed with ${status.status}` };
  }

  return {
    ok: true,
    files: parseGitStatusPorcelainZ(status.stdout).filter((file) =>
      isPackageImpactingFile(file, packageImpactingPrefixes, packageImpactingFiles)
    ),
  };
}

export function packageImpactingChangesSince(
  commit,
  { git, packageImpactingPrefixes, packageImpactingFiles }
) {
  if (!commit) {
    return { ok: false, detail: 'archive manifest has no gitCommit' };
  }

  const commitProbe = git(['cat-file', '-e', `${commit}^{commit}`]);
  if (!commitProbe.ok) {
    return { ok: false, detail: `git commit not found locally: ${commit}` };
  }

  const diff = git(['diff', '--name-only', `${commit}..HEAD`]);
  if (!diff.ok) {
    return { ok: false, detail: diff.stderr.trim() || `git diff failed with ${diff.status}` };
  }

  const changedFiles = diff.stdout
    .split(/\r?\n/)
    .map(normalizeRepoPath)
    .filter(Boolean);
  const impactingFiles = changedFiles.filter((file) =>
    isPackageImpactingFile(file, packageImpactingPrefixes, packageImpactingFiles)
  );

  return {
    ok: true,
    changedFiles,
    impactingFiles,
  };
}
