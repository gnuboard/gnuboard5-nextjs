import { expect, test } from "@playwright/test";
import { DEFAULT_SEO_SITEMAP_LIMIT, isSeoIndexableBoard, parseSeoSettings } from "@/lib/seo-config";

// G5_NEXTJS_SEO* 설정 해석. Vercel(Next 서버)과 테마 브리지(PHP)가 같은 규칙을 쓴다.

test("everything is off by default — search engines see nothing until the installer opts in", () => {
  const settings = parseSeoSettings({});
  expect(settings.enabled).toBe(false);
  expect(settings.sitemap).toBe(false);
  expect(settings.excludedBoards).toEqual([]);
  expect(settings.sitemapLimit).toBe(DEFAULT_SEO_SITEMAP_LIMIT);
});

test("on/off accept the usual spellings", () => {
  for (const value of ["on", "ON", "true", "1", "yes", " on "]) {
    expect(parseSeoSettings({ G5_NEXTJS_SEO: value }).enabled).toBe(true);
  }
  for (const value of ["off", "false", "0", "no", "", "maybe"]) {
    expect(parseSeoSettings({ G5_NEXTJS_SEO: value }).enabled).toBe(false);
  }
});

test("the sitemap switch only matters when SEO itself is on", () => {
  expect(parseSeoSettings({ G5_NEXTJS_SEO_SITEMAP: "on" }).sitemap).toBe(false);
  expect(parseSeoSettings({ G5_NEXTJS_SEO: "on", G5_NEXTJS_SEO_SITEMAP: "on" }).sitemap).toBe(true);
  expect(parseSeoSettings({ G5_NEXTJS_SEO: "on" }).sitemap).toBe(false);
});

test("excluded boards are trimmed, lower-cased and limited to board-name characters", () => {
  const settings = parseSeoSettings({ G5_NEXTJS_SEO_EXCLUDE_BOARDS: " qa, Notice ,,bad/name, free " });
  expect(settings.excludedBoards).toEqual(["qa", "notice", "free"]);
});

test("the sitemap limit is clamped to 1..50000 (the sitemap protocol maximum)", () => {
  expect(parseSeoSettings({ G5_NEXTJS_SEO_SITEMAP_LIMIT: "120" }).sitemapLimit).toBe(120);
  expect(parseSeoSettings({ G5_NEXTJS_SEO_SITEMAP_LIMIT: "999999" }).sitemapLimit).toBe(50000);
  expect(parseSeoSettings({ G5_NEXTJS_SEO_SITEMAP_LIMIT: "0" }).sitemapLimit).toBe(DEFAULT_SEO_SITEMAP_LIMIT);
  expect(parseSeoSettings({ G5_NEXTJS_SEO_SITEMAP_LIMIT: "abc" }).sitemapLimit).toBe(DEFAULT_SEO_SITEMAP_LIMIT);
});

test("a board is indexable only when SEO is on and the board is not excluded", () => {
  const on = parseSeoSettings({ G5_NEXTJS_SEO: "on", G5_NEXTJS_SEO_EXCLUDE_BOARDS: "qa" });
  expect(isSeoIndexableBoard(on, "free")).toBe(true);
  expect(isSeoIndexableBoard(on, "QA")).toBe(false);
  expect(isSeoIndexableBoard(parseSeoSettings({}), "free")).toBe(false);
});
