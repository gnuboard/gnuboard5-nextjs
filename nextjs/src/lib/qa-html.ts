/*
 * 1:1 문의 본문의 형식 규칙 — 그누보드 qa_html 값(0 글자, 1 HTML, 2 HTML + 자동 줄바꿈)을 다루는 순수 함수.
 * 화면 부품(components/qa/qa-content.tsx · qa-editor.tsx)이 쓰고, tests/qa-html.spec.ts 가 지킨다.
 */

import { plainTextToEditorHtml } from "./editor-content";

/** 보여 줄 HTML — 그누보드 conv_content 처럼 2 는 줄바꿈을 <br> 로. 글자 글(0)은 HTML 로 그리지 않으므로 null. */
export function qaBodyHtml(content: string, html: number): string | null {
  if (!html) return null;
  return html === 2 ? content.replace(/\r?\n/g, "<br>") : content;
}

/**
 * 저장된 본문을 에디터에 넣을 HTML 로 — 글자 글(0)은 줄마다 문단으로(태그는 글자로 이스케이프),
 * 자동 줄바꿈 HTML(2)은 줄바꿈을 <br> 로. 에디터로 고쳐 저장하면 qa_html=1 이 된다(그누보드 에디터와 같다).
 */
export function qaContentForEditor(content: string, html: number): string {
  if (html === 1) return content;
  if (html === 2) return content.replace(/\r?\n/g, "<br>");
  return plainTextToEditorHtml(content);
}
