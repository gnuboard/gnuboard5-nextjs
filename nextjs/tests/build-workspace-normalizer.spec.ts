import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeGeneratedWorkspaceReferences,
  normalizeWorkspacePath,
  replaceWorkspaceText,
} from "../scripts/lib/build-workspace-normalizer.mjs";

const normalizerOptions = {
  root: String.raw`C:\repo\nextjs`,
  workspaceRoot: String.raw`C:\repo\nextjs\.g5-next-build-work\1234`,
  workspaceRelative: String.raw`.g5-next-build-work\1234`,
};

test.describe("build workspace normalizer", () => {
  test("normalizes required-server-files workspace paths without changing chunk filenames", () => {
    expect(
      normalizeWorkspacePath(
        {
          appDir: String.raw`C:\repo\nextjs\.g5-next-build-work\1234`,
          relativeAppDir: String.raw`.g5-next-build-work\1234`,
          page: ".g5-next-build-work/1234/src/app/page.tsx",
          chunk: "server/chunks/ssr/_g5-next-build-work_1234_src_app_page.js",
        },
        normalizerOptions
      )
    ).toEqual({
      appDir: String.raw`C:\repo\nextjs`,
      relativeAppDir: "",
      page: "src/app/page.tsx",
      chunk: "server/chunks/ssr/_g5-next-build-work_1234_src_app_page.js",
    });
  });

  test("normalizes Turbopack project references in generated text", () => {
    expect(
      replaceWorkspaceText(
        [
          String.raw`"appDir":"C:\repo\nextjs\.g5-next-build-work\1234"`,
          '"[project]/.g5-next-build-work/1234/src/components/Header.tsx"',
          '"server/chunks/ssr/_g5-next-build-work_1234_src_app_page.js"',
        ].join("\n"),
        normalizerOptions
      )
    ).toBe(
      [
        String.raw`"appDir":"C:\repo\nextjs"`,
        '"[project]/src/components/Header.tsx"',
        '"server/chunks/ssr/_g5-next-build-work_1234_src_app_page.js"',
      ].join("\n")
    );
  });

  test("updates generated text files recursively", () => {
    const root = mkdtempSync(join(tmpdir(), "g5-normalizer-"));
    try {
      const nested = join(root, "server", "app");
      mkdirSync(nested, { recursive: true });
      const manifestPath = join(nested, "page_client-reference-manifest.js");
      const binaryLikePath = join(nested, "image.png");
      writeFileSync(
        manifestPath,
        '"[project]/.g5-next-build-work/1234/src/app/page.tsx"',
        "utf8"
      );
      writeFileSync(binaryLikePath, ".g5-next-build-work/1234", "utf8");

      normalizeGeneratedWorkspaceReferences(root, normalizerOptions);

      expect(readFileSync(manifestPath, "utf8")).toBe('"[project]/src/app/page.tsx"');
      expect(readFileSync(binaryLikePath, "utf8")).toBe(".g5-next-build-work/1234");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
