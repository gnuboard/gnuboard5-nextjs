"use client";

import { useEffect, useState } from "react";
import { getRecentItems } from "@/services/recent";
import { getPopularKeywords } from "@/services/search";
import type { RecentItem } from "@/lib/types";
import type { PopularKeyword } from "@/lib/schemas";
import { SoluneCommentWidget, SolunePopularKeywordWidget } from "./home-widgets";
import { SoluneLoginCard } from "./login-card";

const COMMENT_LIMIT = 6;
const KEYWORD_LIMIT = 5;
/**
 * 본문 요청이 먼저 PHP 에 닿도록 레일은 이만큼 뒤에 부른다. requestIdleCallback 만으로는 안 된다 —
 * 브라우저는 네트워크를 기다리는 동안에도 "한가"로 보고 곧바로 부른다(실측 3~13ms 뒤).
 */
const WIDGET_DELAY_MS = 350;
/** 그 뒤 한가해지기를 기다리는 최대 시간. 이보다 늦어지면 그냥 부른다. */
const IDLE_TIMEOUT_MS = 1200;

/**
 * 잠깐(WIDGET_DELAY_MS) 기다렸다가 브라우저가 한가해진 뒤 부른다. 처음 들어간 안쪽 화면에서 레일 위젯 둘이 본문(글 목록·글)
 * API 와 같은 순간에 PHP 로 몰리면 본문 요청이 그만큼 늦어진다(실측: 목록 API 146ms 중 대부분이 줄서기).
 * 본문이 먼저 가고 위젯은 뒤따르게 한다. 취소 함수를 돌려준다.
 */
function whenIdle(callback: () => void): () => void {
  const idle = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  let handle: number | null = null;
  const timer = window.setTimeout(() => {
    if (idle.requestIdleCallback) {
      handle = idle.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    } else {
      callback();
    }
  }, WIDGET_DELAY_MS);
  return () => {
    window.clearTimeout(timer);
    if (handle !== null) idle.cancelIdleCallback?.(handle);
  };
}

/**
 * 커뮤니티 내부 페이지(게시판 목록·글보기·검색 등)의 오른쪽 레일.
 * 레퍼런스 사이트는 홈뿐 아니라 내부 페이지에서도 같은 사이드바를 유지한다.
 *
 * 셸이 클라이언트 컴포넌트라 데이터는 마운트 후 클라이언트에서 읽는다.
 * 실패해도 레일의 나머지(로그인 카드)는 그대로 보인다.
 */
export function SoluneRail() {
  const [comments, setComments] = useState<RecentItem[]>([]);
  const [keywords, setKeywords] = useState<PopularKeyword[]>([]);
  // 위젯은 조금 늦게 부르므로, 그 사이 "아직 등록된 댓글이 없습니다"가 아니라 자리 표시를 보인다.
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [keywordsLoaded, setKeywordsLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const cancel = whenIdle(() => {
      // 원본 홈의 최신 댓글(latest)처럼 — 새글 표가 비어도 글 표에서 채운다.
      void getRecentItems({ view: "c", limit: COMMENT_LIMIT, fallback: "latest" })
        .then((result) => {
          if (alive) setComments(result.items);
        })
        .catch(() => undefined)
        .finally(() => {
          if (alive) setCommentsLoaded(true);
        });

      void getPopularKeywords(KEYWORD_LIMIT)
        .then((result) => {
          if (alive) setKeywords(result);
        })
        .catch(() => undefined)
        .finally(() => {
          if (alive) setKeywordsLoaded(true);
        });
    });

    return () => {
      alive = false;
      cancel();
    };
  }, []);

  return (
    <aside className="solune-sidebar" aria-label="사이드바">
      <SoluneLoginCard />
      <SoluneCommentWidget comments={comments} loading={!commentsLoaded} />
      <SolunePopularKeywordWidget keywords={keywords} loading={!keywordsLoaded} />
    </aside>
  );
}
