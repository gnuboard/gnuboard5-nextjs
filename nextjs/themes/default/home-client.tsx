"use client";

import { useEffect, useState } from "react";
import { buildCommunityHomeData } from "@/lib/community-home";
import type { G5ThemeCommunityHomeData, G5ThemeComponentProps } from "@/lib/theme-types";
import { loadSoluneHomeExtras, type SoluneHomeExtras } from "./home-data";
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
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    let alive = true;

    Promise.all([buildCommunityHomeData({ runtime: true }), loadSoluneHomeExtras()])
      .then(([nextHome, nextExtras]) => {
        if (!alive) return;
        setHome(nextHome);
        setExtras(nextExtras);
      })
      .catch((error: unknown) => {
        // 빌드 시점 값을 유지하되, 장애가 조용히 묻히지 않도록 남긴다.
        console.error("[solune-home:refresh]", error);
      })
      .finally(() => {
        if (alive) setRefreshed(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  const columns = home.boardPosts.slice(0, BOARD_PANEL_LIMIT);
  const latestPosts = home.latestPosts;
  const rewriteMode = home.bbsRewriteMode;
  const { comments, faqs, poll, gallery, popularKeywords, visit } = extras;
  const loading = !refreshed && columns.length === 0 && latestPosts.length === 0;

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
          {faqs.length > 0 ? (
            <SoluneFaqPanel faqs={faqs} />
          ) : (
            <LatestPanel posts={latestPosts.slice(0, BOARD_ROW_LIMIT)} loading={loading} />
          )}
        </div>

        {gallery ? (
          <SoluneGalleryPanel gallery={gallery} rewriteMode={rewriteMode} />
        ) : loading ? (
          <SoluneGalleryPanelSkeleton />
        ) : null}
      </div>

      <aside className="solune-sidebar" aria-label="사이드바">
        <SoluneLoginCard />
        {/* 레퍼런스 사이드바 순서: 로그인 · 최근 댓글 · 인기검색어 · 설문 · 접속자집계. */}
        <SoluneCommentWidget comments={comments} loading={loading} />
        <SolunePopularKeywordWidget keywords={popularKeywords} loading={loading} />
        {poll ? (
          <SolunePollWidget initialPoll={poll} />
        ) : loading ? (
          <SolunePollWidgetSkeleton />
        ) : null}
        {visit ? (
          <SoluneVisitWidget visit={visit} />
        ) : loading ? (
          <SoluneVisitWidgetSkeleton />
        ) : null}
      </aside>
    </div>
  );
}
