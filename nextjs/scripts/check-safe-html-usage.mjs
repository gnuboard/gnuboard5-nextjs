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
const forbiddenLegacyInnerHtmlWrites = [
  "../theme/basic/skin/member/basic/consent_modal.inc.php",
  "../theme/basic/mobile/skin/member/basic/consent_modal.inc.php",
];
const forbiddenLegacyCommentFormCopies = [
  "../skin/board/basic/view_comment.skin.php",
  "../skin/board/gallery/view_comment.skin.php",
  "../mobile/skin/board/basic/view_comment.skin.php",
  "../mobile/skin/board/gallery/view_comment.skin.php",
  "../theme/basic/skin/board/basic/view_comment.skin.php",
  "../theme/basic/skin/board/gallery/view_comment.skin.php",
  "../theme/basic/mobile/skin/board/basic/view_comment.skin.php",
  "../theme/basic/mobile/skin/board/gallery/view_comment.skin.php",
];
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

for (const relPath of forbiddenLegacyInnerHtmlWrites) {
  const filePath = join(root, relPath);
  if (!existsSync(filePath)) continue;

  const source = readFileSync(filePath, "utf8");
  if (/body\.innerHTML\s*=/.test(source)) {
    errors.push(`${relPath} writes modal template HTML with innerHTML; clone DOM nodes instead`);
  }
}

for (const relPath of forbiddenLegacyCommentFormCopies) {
  const filePath = join(root, relPath);
  if (!existsSync(filePath)) continue;

  const source = readFileSync(filePath, "utf8");
  if (/save_html\s*=|bo_vc_w['"]\)\.innerHTML/.test(source)) {
    errors.push(`${relPath} copies the comment form with innerHTML; move the form node instead`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(`[check-safe-html-usage] ${message}`);
  }
  process.exit(1);
}

console.log("[check-safe-html-usage] SafeHtml usage guards passed");
