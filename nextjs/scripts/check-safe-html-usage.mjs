import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcRoot = join(root, "src");
const searchRoots = [join(srcRoot, "app"), join(srcRoot, "components")];
const allowedFiles = new Set([
  "src/app/layout.tsx",
  "src/components/SafeHtml.tsx",
  "src/components/seo/JsonLd.tsx",
]);
const extensions = new Set([".ts", ".tsx"]);
const forbiddenToken = "dangerouslySetInnerHTML";
// 그누보드 원본 스킨(skin/ · mobile/ · theme/basic/)은 검사하지 않는다 — 원본 파일은 고치지 않으므로
// (5.6.41 원본 그대로) 그쪽 innerHTML 을 막는 검사는 언제나 실패할 뿐이다. 이 검사는 우리 코드만 본다.
const errors = [];

function extensionOf(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && extensions.has(extensionOf(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const filePath of searchRoots.flatMap(walk)) {
  const relPath = relative(root, filePath).replace(/\\/g, "/");
  const source = readFileSync(filePath, "utf8");
  if (!source.includes(forbiddenToken)) continue;
  if (allowedFiles.has(relPath)) continue;

  errors.push(`${relPath} uses ${forbiddenToken}; render sanitized content through components/SafeHtml.tsx`);
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[check-safe-html-usage] ${message}`);
  }
  process.exit(1);
}

console.log("[check-safe-html-usage] SafeHtml usage guards passed");
