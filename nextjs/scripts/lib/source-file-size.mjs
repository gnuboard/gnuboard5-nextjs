import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const SOURCE_FILE_SIZE_BASELINE = "scripts/source-file-size-baseline.json";
export const SOURCE_FILE_SIZE_SPLIT_PLAN = "scripts/source-file-size-split-plan.json";

const SOURCE_TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx"]);
const SOURCE_STYLE_EXTENSIONS = new Set([".css"]);
const THEME_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const SCRIPT_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts"]);
const PHP_EXTENSIONS = new Set([".php"]);

function numberFromEnv(env, name, fallback) {
  const value = Number(env[name] || fallback);
  return Number.isFinite(value) ? value : fallback;
}

export function sourceFileSizeTargets(root, env = process.env) {
  return [
    {
      dir: join(root, "src"),
      extensions: SOURCE_TYPESCRIPT_EXTENSIONS,
      maxLines: numberFromEnv(env, "MAX_SOURCE_FILE_LINES", 1200),
      warnLines: numberFromEnv(env, "WARN_SOURCE_FILE_LINES", 700),
    },
    {
      dir: join(root, "src"),
      extensions: SOURCE_STYLE_EXTENSIONS,
      maxLines: numberFromEnv(env, "MAX_SOURCE_STYLE_FILE_LINES", 1200),
      warnLines: numberFromEnv(env, "WARN_SOURCE_STYLE_FILE_LINES", 900),
    },
    {
      dir: join(root, "themes"),
      extensions: THEME_EXTENSIONS,
      maxLines: numberFromEnv(env, "MAX_THEME_SOURCE_FILE_LINES", 800),
      warnLines: numberFromEnv(env, "WARN_THEME_SOURCE_FILE_LINES", 650),
    },
    {
      dir: join(root, "scripts"),
      extensions: SCRIPT_EXTENSIONS,
      maxLines: numberFromEnv(env, "MAX_SCRIPT_FILE_LINES", 1500),
      warnLines: numberFromEnv(env, "WARN_SCRIPT_FILE_LINES", 700),
    },
    {
      dir: join(root, "..", "overlay", "api"),
      extensions: PHP_EXTENSIONS,
      maxLines: numberFromEnv(env, "MAX_PHP_FILE_LINES", 1500),
      warnLines: numberFromEnv(env, "WARN_PHP_FILE_LINES", 700),
    },
    {
      dir: join(root, "..", "overlay", "theme", "nextjs_default", "bridge"),
      extensions: PHP_EXTENSIONS,
      maxLines: numberFromEnv(env, "MAX_BRIDGE_PHP_FILE_LINES", 1500),
      warnLines: numberFromEnv(env, "WARN_BRIDGE_PHP_FILE_LINES", 700),
    },
  ];
}

export function loadSourceFileSizeBaseline(root) {
  const baselinePath = join(root, SOURCE_FILE_SIZE_BASELINE);
  return existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : {};
}

export function loadSourceFileSizeSplitPlan(root) {
  const planPath = join(root, SOURCE_FILE_SIZE_SPLIT_PLAN);
  return existsSync(planPath)
    ? JSON.parse(readFileSync(planPath, "utf8"))
    : {};
}

export function inspectSourceFileSizes(root, targets = sourceFileSizeTargets(root)) {
  return targets.flatMap((target) =>
    walk(target.dir, target.extensions).map((file) => ({
      file: relative(root, file).replace(/\\/g, "/"),
      lines: lineCount(file),
      maxLines: target.maxLines,
      warnLines: target.warnLines,
    }))
  );
}

function extensionOf(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function walk(dir, extensions, files = []) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, extensions, files);
    } else if (entry.isFile() && extensions.has(extensionOf(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function lineCount(filePath) {
  const content = readFileSync(filePath, "utf8");
  return content ? content.split(/\r?\n/).length : 0;
}
