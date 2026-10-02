"use client";

import { RichTextField, useSiteEditor } from "@/components/editor/RichTextField";
import type { QaConfig } from "@/lib/types";

/*
 * 1:1 문의 질문 · 답변의 내용 입력 — 그누보드 bbs/qawrite.php · qaview.php 처럼 사이트 에디터(cf_editor)가 있고
 * 1:1문의 설정의 "DHTML 에디터 사용"(qa_use_editor)이 켜져 있으면 게시판 글쓰기와 같은 웹 에디터를, 아니면
 * 글자 입력칸을 쓴다. 에디터로 쓴 내용은 qa_html=1 로 저장한다. (그누보드는 휴대폰에서 에디터를 끄지만,
 * 이 앱의 게시판 글쓰기처럼 휴대폰에서도 에디터를 쓴다.) 입력 부품은 상품후기 · 댓글과 같은 RichTextField.
 */

/** 이 사이트에서 1:1 문의를 에디터로 쓰는지. 사이트 설정을 받기 전에는 null(useSiteEditor 와 같다). */
export function useQaEditor(config: QaConfig | null): boolean | null {
  const siteEditor = useSiteEditor();
  if (siteEditor === null) return null;
  return siteEditor && config?.qa_use_editor === 1;
}

// 형식 변환은 시험할 수 있게 lib/qa-html.ts 에 둔다(이 파일은 에디터를 불러와 Node 시험에서 못 읽는다).
export { qaContentForEditor } from "@/lib/qa-html";

export function QaContentInput({
  id,
  value,
  onChange,
  useEditor,
  rows = 10,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  useEditor: boolean;
  rows?: number;
}) {
  return <RichTextField id={id} value={value} onChange={onChange} useEditor={useEditor} rows={rows} compact={false} />;
}
