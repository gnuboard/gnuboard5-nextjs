"use client";

import { useEffect, useState } from "react";
import { buildCommunityHomeData } from "@/lib/community-home";
import type { G5ThemeCommunityHomeData, G5ThemeComponentProps } from "@/lib/theme-types";
import { loadSoluneHomeExtraParts, type SoluneHomeExtras } from "./home-data";
import { BOARD_PANEL_LIMIT, BOARD_ROW_LIMIT, BoardPanel, LatestPanel } from "./home-panels";
import {
  SoluneCommentWidget,
  SoluneFaqPanel,
  SoluneGalleryPanel,
  SolunePopularKeywordWidget,
  SoluneVisitWidget,
} from "./home-widgets";
import { SoluneLoginCard } from "./login-card";
import { SolunePollWidget } from "./poll-widget";
import { SoluneSitePopups } from "./site-popups";
import {
  SoluneGalleryPanelSkeleton,
  SolunePanelSkeleton,
  SolunePollWidgetSkeleton,
  SoluneVisitWidgetSkeleton,
} from "./home-skeletons";

type SoluneHomeClientProps = {
  config: G5ThemeComponentProps["config"];
  initialHome: G5ThemeCommunityHomeData;
  initialExtras: SoluneHomeExtras;
};

/** 따로 도착하는 칸: 게시판 패널 묶음(home) · FAQ 가 없을 때의 최신글(latest) · 위젯 하나하나. */
type HomePart = "home" | "latest" | keyof SoluneHomeExtras;

/**
 * 홈 본체. 서버가 준 초기값으로 먼저 그리고(하이드레이션이 서버 HTML 과 맞도록),
 * 붙은 뒤 브라우저에서 같은 데이터를 한 번 더 받아 갈아 끼운다.
 *
 * 휴대용 정적 빌드는 어느 사이트의 글도 굽지 않는다. 그래서 초기값은 보통 비어 있고,
 * 이 갱신이 곧 실제 첫 내용이다. API 가 잠시 죽어 있으면 초기값을 그대로 둔다.
 */
export function SoluneHomeClient({ config, initialHome, initialExtras }: SoluneHomeClientProps) {
  const [home, setHome] = useState(initialHome);
  const [extras, setExtras] = useState(initialExtras);
  // 최신글 칸은 패널과 따로 받는다(아래 효과) — 패널 묶음이 나중에 와도 덮어쓰지 않게 따로 둔다.
  const [latestPosts, setLatestPosts] = useState(initialHome.latestPosts);
  // 응답이 온(성공이든 실패든) 칸. 칸마다 따로 채운다 — 전부 모일 때까지 기다리면
  // 가장 느린 응답 하나가 첫 화면 전체를 붙잡는다(설문 API 를 1.5초 늦추자 갤러리가
  // 0.78초에서 2.0초로 밀렸다).
  const [done, setDone] = useState<ReadonlySet<HomePart>>(() => new Set());

  useEffect(() => {
    let alive = true;
    const settle = (part: HomePart) => {
      if (alive) setDone((prev) => new Set(prev).add(part));
    };

    // 게시판 글은 패널에 그릴 게시판 것만 받는다(기본은 12개 게시판을 받는다).
    buildCommunityHomeData({ runtime: true, postBoards: BOARD_PANEL_LIMIT })
      .then((nextHome) => {
        if (alive) setHome(nextHome);
      })
      .catch((error: unknown) => {
        // 빌드 시점 값을 유지하되, 장애가 조용히 묻히지 않도록 남긴다.
        console.error("[solune-home:refresh]", error);
      })
      .finally(() => settle("home"));

    // 각 조회는 실패해도 빈 값으로 끝난다(home-data.ts).
    const parts = loadSoluneHomeExtraParts({ runtime: true });
    (Object.keys(parts) as (keyof SoluneHomeExtras)[]).forEach((key) => {
      void parts[key].then((value) => {
        if (alive) setExtras((prev) => ({ ...prev, [key]: value }));
        settle(key);
      });
    });

    // 마지막 칸은 FAQ 가 없을 때만 최신글이다. 그때만 여러 게시판에서 최신글을 고른다 —
    // 앞의 패널 게시판 글은 홈 묶음끼리 나눠 써서 다시 받지 않는다(lib/community-home.ts).
    void parts.faqs.then((faqs) => {
      if (faqs.length > 0) return;
      buildCommunityHomeData({ runtime: true })
        .then((fullHome) => {
          if (alive) setLatestPosts(fullHome.latestPosts);
        })
        .catch((error: unknown) => {
          console.error("[solune-home:latest]", error);
        })
        .finally(() => settle("latest"));
    });

    return () => {
      alive = false;
    };
  }, []);

  const columns = home.boardPosts.slice(0, BOARD_PANEL_LIMIT);
  const rewriteMode = home.bbsRewriteMode;
  const { comments, faqs, poll, gallery, popularKeywords, visit } = extras;
  const waiting = (part: HomePart) => !done.has(part);
  const loading = waiting("home") && columns.length === 0 && latestPosts.length === 0;

  return (
    <div className="solune-content-shell" aria-busy={loading}>
      {loading ? (
        <p className="sr-only" role="status">
          커뮤니티 콘텐츠를 불러오는 중입니다.
        </p>
      ) : null}
      {/* 레퍼런스 홈은 히어로 없이 패널 격자로 바로 들어간다. 마지막 칸은 FAQ가
          있으면 FAQ, 없으면 최근 게시글로 채워 격자가 비지 않게 한다. */}
      {/* 셸이 이미 <main id="main-content"> 를 그린다. 여기서 또 <main> 을 쓰면
          main 이 중첩돼 랜드마크가 둘이 된다. */}
      <div className="solune-main-content">
        <h1 className="sr-only">{config.site.name} 커뮤니티</h1>

        <div className="solune-board-grid">
          {columns.length > 0
            ? columns.map((column) => (
                <BoardPanel
                  key={column.board.bo_table}
                  column={column}
                  rewriteMode={rewriteMode}
                  loading={loading}
                />
              ))
            : loading
              ? Array.from({ length: BOARD_PANEL_LIMIT }, (_, index) => (
                  <SolunePanelSkeleton key={`board-${index}`} rows={BOARD_ROW_LIMIT} />
                ))
              : null}
          {/* FAQ 가 올지 모르는 동안은 자리만 잡는다 — 최근 글을 먼저 보였다가 FAQ 로
              바꿔 끼우면 칸 내용이 한 번 뒤집힌다. */}
          {faqs.length > 0 ? (
            <SoluneFaqPanel faqs={faqs} />
          ) : waiting("faqs") ? (
            <SolunePanelSkeleton rows={BOARD_ROW_LIMIT} />
          ) : (
            <LatestPanel posts={latestPosts.slice(0, BOARD_ROW_LIMIT)} loading={waiting("latest")} />
          )}
        </div>

        {gallery ? (
          <SoluneGalleryPanel gallery={gallery} rewriteMode={rewriteMode} />
        ) : waiting("gallery") ? (
          <SoluneGalleryPanelSkeleton />
        ) : null}
      </div>

      <aside className="solune-sidebar" aria-label="사이드바">
        <SoluneLoginCard />
        {/* 레퍼런스 사이드바 순서: 로그인 · 최근 댓글 · 인기검색어 · 설문 · 접속자집계. */}
        <SoluneCommentWidget comments={comments} loading={waiting("comments")} />
        <SolunePopularKeywordWidget keywords={popularKeywords} loading={waiting("popularKeywords")} />
        {poll ? (
          <SolunePollWidget initialPoll={poll} />
        ) : waiting("poll") ? (
          <SolunePollWidgetSkeleton />
        ) : null}
        {visit ? (
          <SoluneVisitWidget visit={visit} />
        ) : waiting("visit") ? (
          <SoluneVisitWidgetSkeleton />
        ) : null}
      </aside>
      <SoluneSitePopups division="comm" />
    </div>
  );
}
