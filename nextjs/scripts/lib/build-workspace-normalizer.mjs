import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GENERATED_TEXT_FILE_RE = /\.(?:html|js|json|map|mjs|txt|webmanifest|xml)$/i;

function workspaceOptions(options) {
  const workspaceRoot = options.workspaceRoot;
  const root = options.root;
  const workspaceRelative = options.workspaceRelative;
  const workspaceForward = workspaceRelative.replaceAll('\\', '/');
  const workspaceEscaped = workspaceRelative.replaceAll('\\', '\\\\');

  return {
    root,
    rootForward: root.replaceAll('\\', '/'),
    workspaceRoot,
    workspaceRootForward: workspaceRoot.replaceAll('\\', '/'),
    workspaceForward,
    workspaceEscaped,
  };
}

export function normalizeWorkspacePath(value, options) {
  const normalizedOptions = workspaceOptions(options);
  if (typeof value === 'string') {
    const normalized = value.includes(normalizedOptions.workspaceRoot)
      ? value.replaceAll(normalizedOptions.workspaceRoot, normalizedOptions.root)
      : value;
    const normalizedForward = normalized.replaceAll('\\', '/');
    if (normalizedForward === normalizedOptions.workspaceForward) return '';
    if (normalizedForward.startsWith(`${normalizedOptions.workspaceForward}/`)) {
      return normalizedForward.slice(normalizedOptions.workspaceForward.length + 1);
    }
    const workspaceIndex = normalizedForward.indexOf(`/${normalizedOptions.workspaceForward}/`);
    if (workspaceIndex >= 0) {
      return normalizedForward.slice(workspaceIndex + normalizedOptions.workspaceForward.length + 2);
    }
    if (normalizedForward.endsWith(`/${normalizedOptions.workspaceForward}`)) return '';
    return normalized;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeWorkspacePath(item, options));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeWorkspacePath(item, options)])
    );
  }

  return value;
}

export function replaceWorkspaceText(content, options) {
  const normalizedOptions = workspaceOptions(options);
  const nextContent = content
    .replaceAll(normalizedOptions.workspaceRoot, normalizedOptions.root)
    .replaceAll(normalizedOptions.workspaceRootForward, normalizedOptions.rootForward)
    .replaceAll(`[project]/${normalizedOptions.workspaceForward}/`, '[project]/')
    .replaceAll(`${normalizedOptions.workspaceForward}/`, '')
    .replaceAll(`${normalizedOptions.workspaceEscaped}\\\\`, '')
    .replaceAll(normalizedOptions.workspaceForward, '')
    .replaceAll(normalizedOptions.workspaceEscaped, '');

  if (
    nextContent.includes(normalizedOptions.workspaceForward) ||
    nextContent.includes(normalizedOptions.workspaceEscaped)
  ) {
    throw new Error('Generated artifact still points at the temporary build workspace after normalization.');
  }
  return nextContent;
}

export function normalizeGeneratedWorkspaceReferences(dir, options) {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      normalizeGeneratedWorkspaceReferences(fullPath, options);
      continue;
    }

    if (!entry.isFile() || !GENERATED_TEXT_FILE_RE.test(entry.name)) continue;

    const original = readFileSync(fullPath, 'utf8');
    const normalized = replaceWorkspaceText(original, options);
    if (normalized !== original) {
      writeFileSync(fullPath, normalized);
    }
  }
}
