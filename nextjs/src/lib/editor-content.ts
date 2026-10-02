/*
 * 웹 에디터와 글자 입력칸 사이에서 본문을 옮기는 순수 함수 — 후기 · 상품문의 · 댓글 · 1:1 문의가 함께 쓴다.
 * 사이트 에디터(cf_editor)를 켜고 끄면 예전에 다른 쪽으로 쓴 글을 고치게 되므로, 그때 본문을 맞게 바꿔 넣는다.
 */

/** 사이트가 에디터를 쓰는지 — 관리자 > 기본환경설정 > "에디터 선택"(cf_editor)이 "사용안함"(빈 값)이 아니면. */
export function siteUsesEditor(cfEditor: unknown): boolean {
  return String(cfEditor ?? "").trim() !== "";
}

/**
 * 댓글을 웹 에디터로 쓰는지 — "에디터 선택"(cf_editor)에 에디터가 골라져 있고, 그리고 api/.env 의
 * G5_COMMENT_EDITOR_USE 가 켜져 있을 때(공개 설정의 comment_editor). 그누보드 댓글은 원래 글자 입력칸이고
 * 그누보드 화면은 댓글을 글자로 보여 주므로, 댓글 에디터는 사이트가 따로 켠다(없으면 꺼짐).
 */
export function commentEditorOn(cfEditor: unknown, commentEditorFlag: unknown): boolean {
  return siteUsesEditor(cfEditor) && commentEditorFlag === true;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 에디터 · 그누보드 에디터가 만드는 태그. 글자 글에 우연히 든 "<" 를 HTML 로 오인하지 않으려고 태그 이름으로 본다.
const HTML_TAG = /<\/?(p|br|div|span|strong|b|em|i|u|s|strike|del|a|img|ul|ol|li|blockquote|h[1-6]|pre|code|table|thead|tbody|tr|td|th|hr|font|sub|sup|mark)\b[^>]*>/i;

/** 본문이 HTML(에디터로 쓴 글)인지 — 태그가 하나도 없으면 글자 글이다. */
export function looksLikeHtml(content: string | null | undefined): boolean {
  return HTML_TAG.test(content ?? "");
}

/** 글자 글을 에디터에 넣을 HTML 로 — 줄마다 문단, 태그 문자는 글자로(이스케이프). */
export function plainTextToEditorHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

/** 에디터를 열 때 넣을 본문 — HTML 이면 그대로, 글자 글이면 문단으로. */
export function contentForEditor(content: string | null | undefined): string {
  const value = content ?? "";
  return looksLikeHtml(value) ? value : plainTextToEditorHtml(value);
}

/** 보낼 만한 내용이 있는지 — 에디터의 빈 문단(<p></p>)은 비었다고 본다. 사진만 있는 글은 내용이 있다. */
export function hasContent(content: string | null | undefined, fromEditor: boolean): boolean {
  const value = content ?? "";
  if (!fromEditor) return value.trim() !== "";
  if (/<img\b/i.test(value)) return true;
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
}
