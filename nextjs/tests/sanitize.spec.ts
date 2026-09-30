import { expect, test } from "@playwright/test";
import {
  sanitizeCommerceHtml,
  sanitizeInlineHtml,
  sanitizeUserHtml,
  sanitizeHtml,
} from "../src/lib/sanitize";

test.describe("sanitizeHtml", () => {
  test("removes executable markup while preserving safe formatting", () => {
    const html = `
      <h2>Title</h2>
      <img src="javascript:alert(1)" onerror="alert(2)" alt="bad">
      <a href="https://example.com" onclick="alert(3)">link</a>
      <script>alert(4)</script>
    `;

    const sanitized = sanitizeHtml(html);

    expect(sanitized).toContain("<h2>Title</h2>");
    expect(sanitized).toContain('href="https://example.com"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("<script");
  });

  test("adds an accessible label to image-only links", () => {
    const sanitized = sanitizeHtml('<a href="/shop/1"><img src="/item.png" alt="Item image"></a>');

    expect(sanitized).toContain('aria-label="Item image"');
  });

  test("drops known hotlink-blocked or unavailable migrated images", () => {
    const sanitized = sanitizeHtml(`
      <p>Body</p>
      <img src="https://demo.sir.kr/gnuboard5/data/editor/image.jpg" alt="blocked">
      <img src="http://www.hancomlifecare.com/files/product/image.jpg" alt="timeout">
      <img src="https://cdn.example.com/image.jpg" alt="normal">
    `);

    expect(sanitized).toContain("<p>Body</p>");
    expect(sanitized).not.toContain("demo.sir.kr");
    expect(sanitized).not.toContain("hancomlifecare.com");
    expect(sanitized).toContain('src="https://cdn.example.com/image.jpg"');
  });

  test("uses a tighter policy for user supplied html", () => {
    const sanitized = sanitizeUserHtml(
      '<h2 class="hero">Title</h2><p class="lead">Body</p><table><tr><td>x</td></tr></table>'
    );

    expect(sanitized).not.toContain("<h2");
    expect(sanitized).not.toContain("<table");
    expect(sanitized).not.toContain('class="');
    expect(sanitized).toContain("<p>Body</p>");
  });

  test("keeps richer admin commerce html separate from user html", () => {
    const sanitized = sanitizeCommerceHtml(
      '<figure class="product"><table><tr><td>Spec</td></tr></table></figure>'
    );

    expect(sanitized).toContain("<figure");
    expect(sanitized).toContain("<table");
    expect(sanitized).toContain('class="product"');
  });

  test("strips block markup from inline html", () => {
    const sanitized = sanitizeInlineHtml('<p>Block</p><strong>Inline</strong>');

    expect(sanitized).not.toContain("<p>");
    expect(sanitized).toContain("<strong>Inline</strong>");
  });
});
