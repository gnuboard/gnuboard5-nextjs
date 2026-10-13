"use client";

import { createContext, useContext } from "react";
import type { DocsBook } from "./docs-nav";

/** settled: 더 받을 목차가 없다(서버가 다 읽었거나 브라우저가 다시 읽기를 마쳤다). */
type HandbookDocsValue = { books: DocsBook[]; settled: boolean };

const HandbookDocsContext = createContext<HandbookDocsValue>({ books: [], settled: true });

/**
 * 셸이 읽은 매뉴얼 목차를 본문 쪽에 건넨다. 글 보기 머리 슬롯(board-view-header.tsx)은
 * 앱의 글 보기 화면 안에서 그려져 셸의 props 를 받을 길이 없어, 이 문맥으로 자기 장의
 * 위치("02 / 24장")를 찾는다.
 */
export const HandbookDocsProvider = HandbookDocsContext.Provider;

export function useHandbookDocs(): HandbookDocsValue {
  return useContext(HandbookDocsContext);
}

/** 첫 화면 머리의 제목 · 소개 — 관리자 › 테마 화면 설정에 적은 값. 설정이 없으면 null(첫 화면이 받은 테마 기본값). */
type HandbookHomeTexts = { title: string; description: string } | null;

const HandbookHomeTextsContext = createContext<HandbookHomeTexts>(null);

/** 셸이 설정을 읽어 첫 화면(home-content.tsx)에 건넨다 — 첫 화면 슬롯은 서버 컴포넌트라 설정을 직접 읽지 않는다. */
export const HandbookHomeTextsProvider = HandbookHomeTextsContext.Provider;

export function useHandbookHomeTexts(): HandbookHomeTexts {
  return useContext(HandbookHomeTextsContext);
}
