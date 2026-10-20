"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, List, LogIn, LogOut, X } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { currentPathForRuntime } from "@/lib/config";
import { g5ShortHref } from "@/lib/g5-short-url";
import { useRuntimeMenus } from "@/hooks/useRuntimeMenus";
import { useAuthStore } from "@/store/auth";
import { DOCS_GROUP, docsIndexPath, docsSourceFrom, type DocsBook } from "./docs-nav";
import { useDocsBooks } from "./use-docs-chapters";
import { useNavScrollMemory } from "./use-nav-scroll";
import { HandbookPageToc } from "./page-toc";
import { HandbookMainNav, siteMenuItems } from "./main-nav";
import { DrawerSiteMenu } from "./drawer-menu";
import { DocsSearch } from "./doc-search";
import { HandbookThemeSwap, handbookThemeBootScript } from "./theme-swap";
import { bookForPath, bookGroupsFromMenu, chapterPositionByPath, menuGroupForPath } from "./book-nav";
import { BookSelector, ChapterList } from "./book-selector";
import { BookBrowseList, SidebarMenuGroup } from "./sidebar-sections";
import { ChapterPager } from "./chapter-pager";
import { HandbookDocsProvider, HandbookHomeTextsProvider } from "./docs-context";
import { handbookHomeTexts, sidebarState, withSiteTexts, type HandbookThemeSettings } from "./theme-settings";
import { useHandbookThemeSettings } from "./use-theme-settings";
import {
  EditLinks,
  EditPencil,
  SettingsEditorButton,
  SettingsEditorLoader,
  SettingsEditorNotice,
} from "./settings-editor/edit-buttons";
import { useSettingsEditor } from "./settings-editor/editor-store";
import type {
  G5ThemeConfig,
  G5ThemeLayoutShellProps,
} from "@/lib/theme-types";

const subscribeNothing = () => () => {};

/**
 * 지금 매뉴얼 · 장 · 메뉴 묶음을 고르는 주소.
 *
 * 서버 실행(next start · 개발 서버)은 서버와 브라우저가 같은 주소로 그리므로 처음 HTML 부터 실제 주소를 쓴다 —
 * 지금 장 강조 · 목차 펼침 · 앞뒤 장이 처음부터 보인다.
 *
 * 정적 빌드는 미리 만들지 않은 글을 자리표시 주소(/boards/__g5_static__/0)로 그린 HTML 하나로 내보내, 서버가 그린
 * HTML 과 브라우저의 첫 렌더가 다른 주소를 본다. 어긋난 속성은 React 가 조용히 서버 값으로 남겨 표시가 끝내 붙지
 * 않거나 하이드레이션 오류가 난다. 그래서 하이드레이션 동안만 빈 주소로 두고, 붙은 뒤에는 바로 실제 주소를 쓴다
 * (useSyncExternalStore 의 서버 값 → 브라우저 값 — 효과로 늦게 바꾸지 않아 화면 이동 때 한 박자 늦지 않는다).
 */
const isServerRuntime = () => process.env.G5_NEXT_RUNTIME !== "static";

function useHighlightPath(pathname: string): string {
  // 서버 값: 서버 실행은 true(처음부터 실제 주소 — 하이드레이션 뒤 다시 그리지 않는다), 정적 빌드는 false.
  const ready = useSyncExternalStore(subscribeNothing, () => true, isServerRuntime);
  return ready ? pathname : "";
}


/**
 * data-ts="키" — 정적 빌드에서 테마 브리지가 요청 때 그 요소의 글자를 관리자 › 테마 화면 설정의 문구로 바꿔 내보낸다
 * (theme/handbook/bridge/settings-html.php). 화면도 하이드레이션 때 같은 설정으로 그려 글자가 맞는다 — 기본 문구가 잠깐
 * 보였다 바뀌지 않게. 요소 안에는 그 글자만 둔다.
 */
function ShellFooter({ config, indexPath }: { config: G5ThemeConfig; indexPath: string }) {
  return (
    <footer className="doc-footer">
      <div className="doc-footer-inner doc-edit-anchor">
        <EditPencil tab="site" label="바닥글 문구 수정" className="is-corner" />
        <div className="doc-footer-cols">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="doc-brand-mark" aria-hidden>
                {config.site.logoMark}
              </span>
              <span className="text-base font-black text-[color:var(--doc-ink)]" data-ts="name">
                {config.site.name}
              </span>
            </div>
            <p data-ts="footerDescription">{config.site.footerDescription}</p>
          </div>
          <div>
            <h2 data-ts="customerCenterTitle">{config.site.customerCenterTitle}</h2>
            <ul className="space-y-1" data-ts="customerCenterLines">
              {/* 관리자가 같은 줄을 두 번 적을 수 있다 — 열쇠에 순서를 넣는다. */}
              {config.site.customerCenterLines.map((line, index) => (
                <li key={`${index}:${line}`}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>바로가기</h2>
            <ul className="space-y-1">
              <li>
                <Link href="/">홈</Link>
              </li>
              <li>
                <Link href={g5ShortHref(indexPath)}>전체 목차</Link>
              </li>
              <li>
                <Link href="/search">통합 검색</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="doc-footer-bottom">
          © <span data-ts="copyrightName">{config.site.copyrightName}</span> · daisyUI 기반 문서형 테마
        </div>
      </div>
    </footer>
  );
}

/**
 * 헤더의 계정 영역. 문서 사이트라 크게 두지 않는다 — 로그인하면 이름과 로그아웃만.
 * 인증 상태가 정해지기 전에는 아무것도 그리지 않아 로그인/로그아웃이 깜빡이지 않게 한다.
 */
function AccountArea() {
  const { isInitialized, user, logout } = useAuthStore();
  if (!isInitialized) return null;

  if (!user) {
    return (
      <Link href="/login" className="doc-topnav-link" aria-label="로그인">
        <span className="inline-flex items-center gap-1.5">
          <LogIn size={15} aria-hidden />
          로그인
        </span>
      </Link>
    );
  }

  return (
    <div className="doc-account">
      <Link href="/mypage" className="doc-topnav-link">
        {user.mb_nick || user.mb_name || user.mb_id}
      </Link>
      <button type="button" className="doc-icon-btn" onClick={() => void logout()} aria-label="로그아웃">
        <LogOut size={15} aria-hidden />
      </button>
    </div>
  );
}

/**
 * 서버 래퍼(layout-shell.server.tsx)가 읽어 온 목차와, 빠짐없이 읽었는지, 관리자 › 테마 화면 설정(서버 실행만 —
 * 정적 빌드는 null 이고 브라우저가 런타임 설정에서 읽는다)을 함께 받는다.
 */
type HandbookShellProps = G5ThemeLayoutShellProps & {
  books?: DocsBook[];
  booksComplete?: boolean;
  themeSettings?: HandbookThemeSettings | null;
};

export function HandbookRootLayoutShell(props: HandbookShellProps) {
  const pathname = currentPathForRuntime(usePathname() || "/");
  const shopRoute = pathname === "/shop" || pathname.startsWith("/shop/");

  return shopRoute ? <>{props.children}</> : <HandbookLayoutShell {...props} />;
}

/**
 * 쇼핑몰 화면의 셸(ShopLayoutShell 슬롯) — 문서 셸 안에 쇼핑 화면 여백 칸(.doc-shop-page, theme.pages.css)을 둔다.
 * 앱의 쇼핑 화면은 바깥 셸이 여백을 준다고 보고 맨 위 칸에 여백이 없다(테마가 없을 때 app/shop/layout.tsx 는
 * site-container px-4 로 감싼다) — 그대로 넣으면 상품 · 장바구니 화면이 사이드바 선에 붙었다.
 */
export function HandbookShopLayoutShell({ children, ...props }: HandbookShellProps) {
  return (
    <HandbookLayoutShell {...props}>
      <div className="doc-shop-page">{children}</div>
    </HandbookLayoutShell>
  );
}

export function HandbookLayoutShell({
  children,
  config: themeConfig,
  menus,
  books,
  booksComplete,
  themeSettings = null,
}: HandbookShellProps) {
  const settings = useHandbookThemeSettings(themeSettings);
  // 관리자가 적은 사이트 문구를 테마 기본 문구 위에 덮는다(비운 칸은 기본 문구).
  const config = useMemo(() => withSiteTexts(themeConfig, settings), [themeConfig, settings]);
  const homeTexts = useMemo(() => handbookHomeTexts(themeConfig, settings), [themeConfig, settings]);
  const docsSource = useMemo(() => docsSourceFrom(themeSettings), [themeSettings]);
  // 최고관리자가 화면 편집 창에서 저장한 설정 — 매뉴얼 목록 · 장 순서가 바뀌었을 수 있어 목차를 그 설정으로 다시 받는다.
  const liveSettings = useSettingsEditor((state) => state.live);
  const liveDocsSource = useMemo(() => (liveSettings ? docsSourceFrom(liveSettings) : null), [liveSettings]);
  // Resolve the active path through the runtime helper so the right book is
  // picked when the static export is served under a base path.
  const pathname = currentPathForRuntime(usePathname() || "/");
  const highlightPath = useHighlightPath(pathname);
  const runtimeMenus = useRuntimeMenus(menus);
  const { books: docsBooks, settled: docsSettled } = useDocsBooks(books, booksComplete, docsSource, liveDocsSource);
  const [open, setOpen] = useState(false);
  const currentBook = bookForPath(docsBooks, highlightPath);
  const docsContext = useMemo(() => ({ books: docsBooks, settled: docsSettled }), [docsBooks, docsSettled]);
  const indexPath = docsIndexPath(docsBooks);
  const menuItems = siteMenuItems(runtimeMenus);
  const bookGroups = bookGroupsFromMenu(docsBooks, menuItems);
  // 사이드바는 화면에 따라 셋 중 하나 — 매뉴얼 화면은 선택기와 목차, 관리자 메뉴 묶음에 든 화면(커뮤니티 ·
  // 고객센터 …)은 그 묶음의 메뉴, 첫 화면과 나머지는 매뉴얼 목록. 정적 빌드는 하이드레이션 동안 주소가 비어
  // 있으므로(useHighlightPath) 그때까지 첫 화면이 아닌 곳은 아무것도 그리지 않는다.
  const menuGroup = currentBook ? undefined : menuGroupForPath(menuItems, highlightPath);
  const showBookBrowse = !currentBook && !menuGroup && (pathname === "/" || highlightPath !== "");
  // 매뉴얼도 없고 어느 메뉴 묶음에도 들지 않는 화면(매뉴얼 없이 handbook 을 쓰는 사이트) — 사이드바가 비지 않게 1280px
  // 이상에서도 사이트 메뉴를 둔다. 목차를 다 받은 뒤에만(settled) 정한다 — 받는 동안 메뉴가 떴다 사라지지 않게.
  const sidebarFallback = showBookBrowse && bookGroups.length === 0 && docsSettled;
  const isChapterPage = currentBook ? chapterPositionByPath(currentBook, highlightPath) !== null : false;
  // 관리자 › 테마 화면 설정의 "숨기기" — 1280px 이상의 왼쪽 열만 뺀다(좁은 화면의 메뉴 서랍은 그대로).
  // 정적 빌드의 하이드레이션 동안(주소를 아직 모를 때)은 정하지 않는다(unknown) — 정적 HTML 과 같은 속성으로 붙고,
  // 그동안은 브리지가 요청 때 정한 <html data-doc-sidebar> 가 쓰인다(theme.shell.css).
  const sidebar = sidebarState(settings, {
    path: highlightPath || pathname,
    pathReady: highlightPath !== "",
    booksSettled: docsSettled,
    inBook: Boolean(currentBook),
  });
  const navScrollRef = useRef<HTMLDivElement>(null);
  useNavScrollMemory(navScrollRef, currentBook?.table ?? menuGroup?.label ?? "docs", highlightPath);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeSidebar = () => setOpen(false);

  // Mobile drawer modal behaviour: move focus into the drawer on open, close on
  // Escape, and restore focus to the hamburger on every close path (X / scrim /
  // Escape / nav click). The background (top bar + page) is marked inert while open.
  useEffect(() => {
    if (!open) return;
    const hamburger = hamburgerRef.current;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    // xl(1280px) 이상에서는 사이드바가 늘 열린 열이라 서랍 상태가 남으면 상단 바 · 본문이 inert 로 막힌다.
    const wide = window.matchMedia("(min-width: 1280px)");
    const closeOnWide = () => {
      if (wide.matches) setOpen(false);
    };
    closeOnWide();
    wide.addEventListener("change", closeOnWide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", closeOnWide);
      hamburger?.focus();
    };
  }, [open]);

  return (
    // data-docs-group — 빌드 때 정한 매뉴얼 그룹. 관리자 설정에 그룹이 없을 때 브리지가 이 값으로 화면 종류(매뉴얼 · 게시판)를
    // 가른다(theme/handbook/bridge/settings-html.php).
    <div className="doc-root" data-docs-group={DOCS_GROUP || undefined}>
      {/* 저장된 라이트/다크(없으면 운영체제 설정)를 첫 페인트 전에 적용한다. */}
      <script dangerouslySetInnerHTML={{ __html: handbookThemeBootScript }} />
      {/* 서랍이 열린 동안 상단 바 · 본문 · 오른쪽 목차 · 푸터는 inert — Tab 이 서랍 뒤로 빠지지 않는다. */}
      <header className="doc-topbar" inert={open || undefined}>
        <button
          ref={hamburgerRef}
          type="button"
          className="doc-icon-btn doc-hamburger"
          aria-label="문서 메뉴 열기"
          aria-expanded={open}
          aria-controls="doc-sidebar-nav"
          onClick={() => setOpen(true)}
        >
          <List size={18} aria-hidden />
        </button>

        <Link href="/" className="doc-brand">
          <span className="doc-brand-mark" aria-hidden>
            {config.site.logoMark}
          </span>
          <span className="doc-brand-name" data-ts="logoText">
            {config.site.logoText}
          </span>
          <span className="doc-brand-badge">docs</span>
        </Link>

        {/* 관리자 > 메뉴설정의 메뉴 — 기본 테마 메인메뉴와 같은 내용 · 동작. 1280px 이상에서만 보이고,
            그보다 좁으면 왼쪽 사이드바(서랍)의 "메뉴" 묶음이 같은 메뉴를 보여 준다. */}
        <HandbookMainNav items={menuItems} />

        {/* 문서 검색 — 누르거나 Ctrl+K 로 검색 창을 연다. 본문 검색은 창 안의 통합 검색 링크로. */}
        <DocsSearch books={docsBooks} current={currentBook} />

        <nav className="doc-topnav sm:ml-2" aria-label="주요 메뉴">
          <Link href={g5ShortHref(indexPath)} className="doc-topnav-link">
            <span className="inline-flex items-center gap-1.5">
              <List size={15} aria-hidden />
              전체 목차
            </span>
          </Link>
          <AccountArea />
        </nav>

        <SettingsEditorButton />
        <HandbookThemeSwap />
      </header>

      {/* daisyUI Drawer — 반응형(xl:drawer-open): 1280px 이상에서는 사이드바가 늘 보이고,
          그보다 좁으면 왼쪽에서 밀려 나오는 서랍이 된다(1024px 에서는 로고 · 메뉴 · 검색 · 목차가
          한 줄에 다 들어가지 않는다 — docs/prototypes/handbook-menu/design-qa.md). 체크 상태는
          React 가 쥔다 — 여닫을 때 포커스 이동 · Escape · 본문 inert 를 함께 다루려고. 키보드로는
          헤더의 메뉴 버튼을 쓰므로 체크박스는 탭 순서와 읽기 순서에서 뺀다. */}
      <div
        className={sidebar === "hidden" ? "drawer doc-drawer" : "drawer xl:drawer-open doc-drawer"}
        data-sidebar={sidebar === "unknown" ? undefined : sidebar}
      >
        <input
          id="doc-drawer-toggle"
          type="checkbox"
          className="drawer-toggle"
          checked={open}
          onChange={(event) => setOpen(event.target.checked)}
          tabIndex={-1}
          aria-hidden
        />

        <div className="drawer-content doc-body" inert={open || undefined}>
          {/* data-doc-chapter: 매뉴얼의 장을 보는 중 — 앱의 다음글/이전글(게시판 글 순서)을 숨기고
              아래 ChapterPager(매뉴얼 목차 순서)만 남긴다(theme.booknav.css). */}
          <main
            id="main-content"
            className="doc-main"
            data-doc-chapter={isChapterPage ? "" : undefined}
          >
            {/* 글 보기 머리 슬롯(board-view-header.tsx)이 자기 장의 위치를 찾도록 목차를 건넨다. */}
            <HandbookDocsProvider value={docsContext}>
              <HandbookHomeTextsProvider value={homeTexts}>{children}</HandbookHomeTextsProvider>
            </HandbookDocsProvider>
            <ChapterPager book={currentBook} path={highlightPath} />
          </main>

          {/* 오른쪽 문서 목차. 본문에 제목이 둘 이상일 때만 스스로 나타난다. */}
          <HandbookPageToc />

          {/* 푸터도 서랍(drawer) 안에 둔다. 밖에 두면 사이드바의 sticky 범위가 본문
              끝에서 잘려, 페이지 맨 아래에서 사이드바가 위로 밀리며 항목이 반쯤
              잘린 채 푸터에 가린다. */}
          <ShellFooter config={config} indexPath={indexPath} />
        </div>

        <div className="drawer-side doc-drawer-side">
          <label htmlFor="doc-drawer-toggle" className="drawer-overlay" aria-hidden />
          <nav id="doc-sidebar-nav" className="doc-sidebar" aria-label="문서 탐색">
            <div className="doc-sidebar-inner" ref={navScrollRef}>
              <div className="doc-sidebar-mobilehead">
                <span className="doc-nav-label">탐색</span>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="doc-icon-btn"
                  aria-label="메뉴 닫기"
                  onClick={closeSidebar}
                >
                  <X size={17} aria-hidden />
                </button>
              </div>

              {/* 서랍 맨 위는 메뉴(관리자 메뉴설정) — 상단 바 메인메뉴가 숨는 1280px 미만에서만 보인다. */}
              <DrawerSiteMenu items={menuItems} onNavigate={closeSidebar} persistent={sidebarFallback} />

              {currentBook ? (
                <>
                  <BookSelector groups={bookGroups} current={currentBook} onNavigate={closeSidebar} />
                  <ChapterList book={currentBook} path={highlightPath} onNavigate={closeSidebar} />
                </>
              ) : null}
              {menuGroup ? (
                <SidebarMenuGroup group={menuGroup} path={highlightPath} onNavigate={closeSidebar} />
              ) : null}
              {showBookBrowse ? <BookBrowseList groups={bookGroups} onNavigate={closeSidebar} /> : null}

              {/* 최고관리자에게만 — 이 사이드바를 보일지, 지금 매뉴얼의 장 순서를 화면 편집 창에서 고친다. */}
              <EditLinks
                items={[
                  { tab: "sidebar", label: "사이드바 설정" },
                  ...(currentBook ? [{ tab: "chapters" as const, label: "이 매뉴얼 장 순서", chapterTable: currentBook.table }] : []),
                ]}
              />

              <div className="doc-nav-section">
                <div className="doc-callout mt-2">
                  <HelpCircle
                    size={16}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-[color:var(--doc-accent-strong)]"
                  />
                  <span>
                    찾는 문서가 없나요?{" "}
                    <Link
                      href="/search"
                      className="font-semibold text-[color:var(--doc-accent-strong)] underline"
                    >
                      통합 검색
                    </Link>
                    을 이용해 보세요.
                  </span>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* 화면 설정 편집 창 · 저장 알림 — 편집 창은 최고관리자일 때만 따로 받는다. 비운 칸에는 테마 기본 문구를 보인다. */}
      <SettingsEditorLoader defaults={themeConfig.site} />
      <SettingsEditorNotice />
    </div>
  );
}
