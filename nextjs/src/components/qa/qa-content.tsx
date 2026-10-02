"use client";

import { SafeHtml } from "@/components/SafeHtml";
import { qaBodyHtml } from "@/lib/qa-html";
import { cn } from "@/lib/utils";

/**
 * 1:1 문의 질문 · 답변 본문 — 그누보드 conv_content($content, $qa_html) 와 같은 규칙:
 * 0 은 글자 그대로(줄바꿈 유지), 1 은 HTML, 2 는 HTML + 줄바꿈을 <br> 로. HTML 은 걸러서 그린다.
 */
export function QaBody({ content, html, className }: { content: string; html: number; className?: string }) {
  const classes = cn("break-words text-sm leading-7", className);
  const source = qaBodyHtml(content, html);
  if (source === null) {
    return <p className={cn("whitespace-pre-wrap", classes)}>{content}</p>;
  }
  return <SafeHtml html={source} className={cn("g5-content", classes)} />;
}

/** 관리자가 1:1문의 설정에 넣은 위 · 아래 내용(qa_content_head/tail). 그누보드처럼 작은 화면은 모바일용을 쓴다. */
export function QaConfigContent({ pc, mobile }: { pc?: string; mobile?: string }) {
  if (!pc && !mobile) return null;
  return (
    <>
      {pc ? <SafeHtml html={pc} className="g5-content hidden md:block" /> : null}
      {mobile ? <SafeHtml html={mobile} className="g5-content md:hidden" /> : null}
    </>
  );
}
