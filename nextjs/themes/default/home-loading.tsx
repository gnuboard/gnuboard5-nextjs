import { BOARD_PANEL_LIMIT, BOARD_ROW_LIMIT } from "./home-panels";
import { SoluneLoginCard } from "./login-card";
import {
  SoluneGalleryPanelSkeleton,
  SolunePanelSkeleton,
  SoluneSidebarWidgetSkeleton,
} from "./home-skeletons";

export function SoluneHomePageLoading() {
  return (
    <div className="solune-content-shell" aria-busy="true">
      <p className="sr-only" role="status">
        커뮤니티 콘텐츠를 불러오는 중입니다.
      </p>
      <div className="solune-main-content">
        <h1 className="sr-only">커뮤니티</h1>
        <div className="solune-board-grid">
          {Array.from({ length: BOARD_PANEL_LIMIT + 1 }, (_, index) => (
            <SolunePanelSkeleton key={index} rows={BOARD_ROW_LIMIT} />
          ))}
        </div>
        <SoluneGalleryPanelSkeleton />
      </div>

      <aside className="solune-sidebar" aria-label="사이드바">
        <SoluneLoginCard />
        <SoluneSidebarWidgetSkeleton rows={5} />
        <SoluneSidebarWidgetSkeleton rows={5} />
        <SoluneSidebarWidgetSkeleton rows={5} />
        <SoluneSidebarWidgetSkeleton rows={4} />
        <SoluneSidebarWidgetSkeleton rows={4} />
      </aside>
    </div>
  );
}
