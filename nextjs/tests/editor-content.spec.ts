import { expect, test } from "@playwright/test";
import { commentEditorOn, contentForEditor, hasContent, looksLikeHtml, plainTextToEditorHtml, siteUsesEditor } from "../src/lib/editor-content";

/*
 * 사이트 에디터(cf_editor) 규칙과 에디터 ↔ 글자 입력칸 사이의 본문 옮기기(src/lib/editor-content.ts).
 * 상품후기 · 상품문의 · 댓글 · 1:1 문의가 함께 쓴다.
 */

test.describe("site editor setting", () => {
  test("any chosen editor turns the web editor on; 사용안함(empty) turns it off", () => {
    expect(siteUsesEditor("smarteditor2")).toBe(true);
    expect(siteUsesEditor("cheditor5")).toBe(true);
    expect(siteUsesEditor("")).toBe(false);
    expect(siteUsesEditor("  ")).toBe(false);
    expect(siteUsesEditor(undefined)).toBe(false);
    expect(siteUsesEditor(null)).toBe(false);
  });

  test("comments use the web editor only when an editor is chosen AND G5_COMMENT_EDITOR_USE is on", () => {
    expect(commentEditorOn("smarteditor2", true)).toBe(true);
    expect(commentEditorOn("smarteditor2", false)).toBe(false);
    expect(commentEditorOn("smarteditor2", undefined)).toBe(false); // 스위치가 없으면(예전 API 포함) 꺼짐
    expect(commentEditorOn("", true)).toBe(false); // 에디터 선택이 사용안함이면 스위치가 켜져 있어도 글자 입력칸
  });
});

test.describe("moving content between the editor and a plain text field", () => {
  test("editor HTML is recognised by its tags; plain text with a stray < is not", () => {
    expect(looksLikeHtml("<p>안녕</p>")).toBe(true);
    expect(looksLikeHtml("줄<br>바꿈")).toBe(true);
    expect(looksLikeHtml('<img src="a.png">')).toBe(true);
    expect(looksLikeHtml("3 < 5 이고 7 > 2")).toBe(false);
    expect(looksLikeHtml("그냥 글자\n두 줄")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
  });

  test("plain text goes into the editor one paragraph per line, tag characters escaped", () => {
    expect(plainTextToEditorHtml("첫 줄\r\n둘째 줄")).toBe("<p>첫 줄</p><p>둘째 줄</p>");
    expect(plainTextToEditorHtml("<script>x</script> & \"q\"")).toBe("<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;</p>");
    expect(contentForEditor("a\nb")).toBe("<p>a</p><p>b</p>");
    expect(contentForEditor("<p>그대로</p>")).toBe("<p>그대로</p>");
    expect(contentForEditor(null)).toBe("<p></p>");
  });

  test("an empty editor paragraph is no content; a picture alone is", () => {
    expect(hasContent("<p></p>", true)).toBe(false);
    expect(hasContent("<p>&nbsp; </p>", true)).toBe(false);
    expect(hasContent('<p><img src="a.png"></p>', true)).toBe(true);
    expect(hasContent("<p>글</p>", true)).toBe(true);
    expect(hasContent("   ", false)).toBe(false);
    expect(hasContent("글", false)).toBe(true);
  });
});
