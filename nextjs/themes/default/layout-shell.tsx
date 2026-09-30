"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, LogIn, Menu, Search, UserPlus, X } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { g5PathForRuntime } from "@/lib/config";
import { G5_COMMUNITY_LOGO, SoluneBrandLogo } from "./brand-logo";
import { SoluneCompanyInfo, useSoluneCompany } from "./site-company";
import { isUnsafeMenuLink, menuAnchorTarget, type MenuItem } from "@/components/layout/menu";
import { useRuntimeMenus } from "@/hooks/useRuntimeMenus";
import { useAuthStore } from "@/store/auth";
import type { G5ThemeConfig, G5ThemeLayoutShellProps } from "@/lib/theme-types";
import { SoluneThemeSwap, soluneThemeBootScript } from "./theme-swap";
import { SoluneRail } from "./rail";
import { SoluneNotifyLink } from "./notify-link";
import { useLoginHref, useRuntimePathname } from "./use-runtime-pathname";

type NavItem = {
  label: string;
  href: string;
  target?: "_blank";
  children: NavItem[];
};

const FOOTER_LINKS = [
  { label: "사이트 소개", href: "/content/company" },
  { label: "개인정보처리방침", href: "/content/privacy" },
  { label: "이용약관", href: "/content/provision" },
];

/** Menus arrive from Gnuboard, so links are validated before they are rendered. */
function menuToNavItem(menu: MenuItem): NavItem | null {
  const href = (menu.me_link || "").trim();
  const label = (menu.me_name || "").trim();
  if (!href || !label || isUnsafeMenuLink(href)) return null;
  return {
    label,
    href,
    target: menuAnchorTarget(menu.me_target),
    children: (menu.children ?? [])
      .map(menuToNavItem)
      .filter((item): item is NavItem => item !== null),
  };
}

/** The reference header always shows a menu rail, so fall back to core routes
 *  when Gnuboard has no menu rows configured yet. */
function fallbackNav(): NavItem[] {
  return [
    {
      label: "커뮤니티",
      href: "/recent",
      children: [
        { label: "최근 게시글", href: "/recent", children: [] },
        { label: "통합검색", href: "/search", children: [] },
        { label: "자주 묻는 질문", href: "/faq", children: [] },
      ],
    },
    {
      label: "쇼핑몰",
      href: "/shop",
      children: [
        { label: "쇼핑몰 홈", href: "/shop", children: [] },
        { label: "이벤트", href: "/shop/events", children: [] },
        { label: "쿠폰존", href: "/shop/couponzone", children: [] },
      ],
    },
    {
      label: "회원 공간",
      href: "/login",
      children: [
        { label: "로그인", href: "/login", children: [] },
        { label: "회원가입", href: "/register", children: [] },
        { label: "마이페이지", href: "/mypage", children: [] },
      ],
    },
  ];
}

/* 레퍼런스는 커뮤니티 내부 페이지에서도 오른쪽 레일을 유지한다. 다만 홈은 자기
   레일을 직접 그리고, 쇼핑·마이페이지·인증 화면은 원래 제 레이아웃(또는 제
   사이드바)을 갖고 있어 레일을 덧대면 두 겹이 된다. 그래서 그 경로만 뺀다. */
const RAIL_EXCLUDED_PREFIXES = [
  "/shop",
  "/mypage",
  "/login",
  "/register",
  "/forgot-password",
  "/bbs",
  "/baby",
  "/organic",
];

function shouldShowRail(pathname: string): boolean {
  if (pathname === "/" || pathname === "/community") return false;
  return !RAIL_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function buildNav(menus: MenuItem[]): NavItem[] {
  const items = menus.map(menuToNavItem).filter((item): item is NavItem => item !== null);
  return items.length > 0 ? items : fallbackNav();
}

function NavAnchor({
  item,
  className,
  onNavigate,
  children,
}: {
  item: NavItem;
  className: string;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  if (item.target === "_blank") {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onNavigate}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {children}
    </Link>
  );
}

/* 서비스 전환 바. 커뮤니티와 쇼핑 셸이 같은 컴포넌트를 쓴다 — 두 서비스의
   머리가 같은 모양이어야 오가는 것이 한 사이트로 읽힌다. */
export function ServiceSwitch({
  isShop,
  shellClassName = "solune-shell",
}: {
  isShop: boolean;
  shellClassName?: string;
}) {
  const { isInitialized, user, logout } = useAuthStore();
  const signedIn = isInitialized && Boolean(user);
  // 로그인 뒤 지금 보던 곳으로 돌아오게 주소를 달아 둔다.
  const loginHref = useLoginHref();

  return (
    <div className="solune-community-service-switch">
      <div className={`${shellClassName} solune-community-service-switch-inner`}>
        <nav aria-label="서비스 전환" className="solune-community-service-links">
          <Link
            href="/"
            className={`solune-community-service-link${isShop ? "" : " solune-community-service-link-active"}`}
          >
            커뮤니티
          </Link>
          <Link
            href="/shop"
            className={`solune-community-service-link${isShop ? " solune-community-service-link-active" : ""}`}
          >
            쇼핑몰
          </Link>
        </nav>

        <nav aria-label="회원 메뉴" className="solune-community-member-menu">
          <span className="solune-community-member-utilities">
            <Link className="solune-community-member-utility" href="/faq">
              FAQ
            </Link>
            <Link className="solune-community-member-utility" href="/mypage/qas">
              Q&amp;A
            </Link>
            <Link className="solune-community-member-utility" href="/recent">
              새글
            </Link>
          </span>
          {signedIn ? (
            <>
              <SoluneNotifyLink />
              {/* 사이드바가 없는 화면(쇼핑몰 · 마이페이지)에서도 관리자 화면으로 갈 수 있게 머리줄에도 둔다. */}
              {user?.is_super_admin && <a href={g5PathForRuntime("/adm/")}>관리자</a>}
              <Link href="/mypage">마이페이지</Link>
              <button type="button" onClick={() => void logout()}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link href={loginHref}>로그인</Link>
              <Link className="solune-community-member-signup" href="/register">
                회원가입
              </Link>
            </>
          )}
          <SoluneThemeSwap />
        </nav>
      </div>
    </div>
  );
}

function MegaNav({ nav }: { nav: NavItem[] }) {
  /* 패널은 CSS 의 :hover · :focus-within 으로 열린다. 메뉴를 눌러 이동해도 포인터는 그 자리에 있고 누른 링크에
     초점이 남아 패널이 그대로 떠 있었다. 누르면 그 칸을 "닫힘"으로 두고(초점도 뺀다) 포인터가 칸을 벗어나면
     다시 hover 로 열리게 한다 — vercel.com 머리 메뉴와 같은 동작. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const dismiss = (index: number) => {
    setDismissed(index);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  return (
    <nav className="solune-community-mega" aria-label="메인메뉴">
      <ul className="solune-community-mega-list">
        {nav.map((item, index) => (
          <li
            className={`solune-community-mega-item${dismissed === index ? " is-dismissed" : ""}`}
            key={`${item.label}:${index}`}
            onMouseLeave={dismissed === index ? () => setDismissed(null) : undefined}
          >
            {item.children.length > 0 ? (
              <>
                {/* Opens on hover / focus-within, exactly like the reference panel. */}
                <NavAnchor item={item} className="solune-community-mega-trigger" onNavigate={() => dismiss(index)}>
                  <span>{item.label}</span>
                  <ChevronDown className="solune-community-mega-caret" size={12} aria-hidden />
                </NavAnchor>
                <div className="solune-community-mega-panel">
                  <div className="solune-community-mega-panel-inner">
                    <section className="solune-community-mega-section" aria-label={item.label}>
                      <ul className="solune-community-mega-links">
                        {item.children.map((child, childIndex) => (
                          <li key={`${child.href}:${childIndex}`}>
                            <NavAnchor item={child} className="solune-community-mega-link" onNavigate={() => dismiss(index)}>
                              <span>{child.label}</span>
                            </NavAnchor>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </div>
              </>
            ) : (
              <NavAnchor item={item} className="solune-community-mega-trigger">
                <span>{item.label}</span>
              </NavAnchor>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* 레퍼런스 tail.layout.php: [로고 ………… 푸터 메뉴] / 사이트 정보(사업자 정보) / [한 줄 소개 ………… 저작권]. */
function ShellFooter({ config }: { config: G5ThemeConfig }) {
  const company = useSoluneCompany();

  return (
    <footer className="solune-footer">
      <div className="solune-shell solune-footer-inner">
        <div className="solune-footer-top">
          <Link href="/" className="solune-community-brand" aria-label={`${config.site.name} 홈`}>
            <SoluneBrandLogo src={G5_COMMUNITY_LOGO} alt="" width={149} height={36} />
          </Link>
          <nav aria-label="푸터 메뉴" className="solune-footer-nav">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <SoluneCompanyInfo company={company} variant="community" className="solune-footer-company" />
        <div className="solune-footer-bottom">
          <p>{config.site.footerDescription}</p>
          <p>
            Copyright © {new Date().getFullYear()} <strong>{config.site.copyrightName}</strong>. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* 스크롤하면 헤더가 떠 보이고(8px 넘게 — 그림자 · 바탕을 채운다) 70px 넘게 내리면 한 단 줄어든다
   (바 64 -> 48px, 로고 32 -> 26px). 레퍼런스 theme.js 와 같은 문턱이다 — 줄이는 문턱을 높게 두는 것은
   살짝만 움직여도 줄었다 늘었다 하면 눈에 거슬려서다. */
const HEADER_SCROLLED_AT = 8;
const HEADER_CONDENSED_AT = 70;

function useHeaderScrollState(): { scrolled: boolean; condensed: boolean } {
  const [state, setState] = useState({ scrolled: false, condensed: false });
  useEffect(() => {
    const sync = () => {
      const y = window.scrollY;
      const next = { scrolled: y > HEADER_SCROLLED_AT, condensed: y > HEADER_CONDENSED_AT };
      setState((prev) => (prev.scrolled === next.scrolled && prev.condensed === next.condensed ? prev : next));
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);
  return state;
}

export function SoluneLayoutShell({ children, config, menus }: G5ThemeLayoutShellProps) {
  // 정적 내보내기가 그누보드 base path 아래에 얹혀도, 클라이언트 이동 뒤에도
  // 같은 값을 보도록 주소 변경을 구독하는 훅으로 읽는다.
  const pathname = useRuntimePathname();
  const loginHref = useLoginHref();
  const isShop = pathname === "/shop" || pathname.startsWith("/shop/");
  const showRail = shouldShowRail(pathname);
  const runtimeMenus = useRuntimeMenus(menus);
  const nav = buildNav(runtimeMenus);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { scrolled, condensed } = useHeaderScrollState();
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeDrawer = () => setDrawerOpen(false);

  /* 검색 독. 레퍼런스처럼 머리의 돋보기를 누르면 그 아래로 검색줄이 펼쳐진다.
     열리면 입력에 초점을 주고, Escape 로 닫는다. 길을 옮기면 닫힌다. */
  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  // Drawer behaves as a modal: focus moves in on open, Escape closes, and focus
  // returns to the hamburger on every close path.
  useEffect(() => {
    if (!drawerOpen) return;
    const hamburger = hamburgerRef.current;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      hamburger?.focus();
    };
  }, [drawerOpen]);

  // 쇼핑몰은 shop-shell.tsx 가 제 크롬(서비스 전환 바 · 쇼핑 헤더 · 푸터)을
  // 그린다. 여기서 또 감싸면 헤더가 두 겹이 된다. 훅은 위에서 모두 돌았다.
  if (isShop) return <>{children}</>;

  return (
    <div className="solune-root solune-page">
      {/* 저장된 라이트/다크 선택을 첫 페인트 전에 뿌리 요소에 적용한다. */}
      <script dangerouslySetInnerHTML={{ __html: soluneThemeBootScript }} />
      <div className="solune-community-header-shell">
        <ServiceSwitch isShop={isShop} />
      </div>

      <div className="solune-community-header-sticky">
        <header className={`solune-community-header${scrolled ? " is-scrolled" : ""}${condensed ? " is-condensed" : ""}`}>
          <div className="solune-shell solune-community-mainbar">
            <div className="solune-community-drawer drawer">
              <input
                id="solune-drawer-toggle"
                type="checkbox"
                className="drawer-toggle"
                checked={drawerOpen}
                onChange={(event) => setDrawerOpen(event.target.checked)}
                tabIndex={-1}
                aria-hidden
              />
              <div className="drawer-content">
                <button
                  ref={hamburgerRef}
                  type="button"
                  className="solune-community-drawer-toggle"
                  aria-controls="solune-drawer-panel"
                  aria-expanded={drawerOpen}
                  aria-label="메뉴 열기"
                  onClick={() => setDrawerOpen(true)}
                >
                  <Menu size={20} strokeWidth={2.6} aria-hidden />
                </button>
              </div>

              <div className="drawer-side solune-community-drawer-side">
                <button
                  type="button"
                  aria-label="메뉴 닫기"
                  className="drawer-overlay solune-community-drawer-overlay"
                  onClick={closeDrawer}
                />
                <aside
                  id="solune-drawer-panel"
                  className="solune-community-drawer-panel"
                  aria-label="모바일 메뉴"
                >
                  <div className="solune-community-drawer-head">
                    <Link
                      href="/"
                      className="solune-community-drawer-brand"
                      onClick={closeDrawer}
                    >
                      <SoluneBrandLogo src={G5_COMMUNITY_LOGO} alt={config.site.name} width={124} height={30} />
                    </Link>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      className="solune-community-drawer-close"
                      aria-label="메뉴 닫기"
                      onClick={closeDrawer}
                    >
                      <X size={18} aria-hidden />
                    </button>
                  </div>

                  <nav className="solune-community-drawer-nav" aria-label="전체 메뉴">
                    <ul className="solune-community-drawer-menu">
                      {nav.map((item, index) => (
                        <li key={`${item.label}:${index}`}>
                          <NavAnchor
                            item={item}
                            className="solune-community-drawer-menu-link"
                            onNavigate={closeDrawer}
                          >
                            <FolderOpen size={16} aria-hidden />
                            <span>{item.label}</span>
                          </NavAnchor>
                          {item.children.length > 0 ? (
                            <ul className="solune-community-drawer-submenu">
                              {item.children.map((child, childIndex) => (
                                <li key={`${child.href}:${childIndex}`}>
                                  <NavAnchor
                                    item={child}
                                    className="solune-community-drawer-submenu-link"
                                    onNavigate={closeDrawer}
                                  >
                                    <span>{child.label}</span>
                                  </NavAnchor>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </nav>

                  <div className="solune-community-drawer-actions">
                    <Link
                      className="solune-drawer-action solune-drawer-action-primary"
                      href={loginHref}
                      onClick={closeDrawer}
                    >
                      <LogIn size={15} aria-hidden />
                      <span>로그인</span>
                    </Link>
                    <Link className="solune-drawer-action" href="/register" onClick={closeDrawer}>
                      <UserPlus size={15} aria-hidden />
                      <span>회원가입</span>
                    </Link>
                  </div>
                </aside>
              </div>
            </div>

            <Link href="/" className="solune-community-brand">
              <SoluneBrandLogo src={G5_COMMUNITY_LOGO} alt={config.site.name} width={124} height={30} />
            </Link>

            <MegaNav nav={nav} />

            <div className="solune-community-header-actions">
              <button
                type="button"
                className="solune-community-search-toggle"
                aria-controls="solune-community-search-dock"
                aria-expanded={searchOpen}
                aria-label={searchOpen ? "검색 닫기" : "검색 열기"}
                onClick={() => setSearchOpen((open) => !open)}
              >
                {searchOpen ? <X size={18} strokeWidth={2.6} aria-hidden /> : <Search size={18} strokeWidth={2.6} aria-hidden />}
              </button>
            </div>
          </div>
        </header>
        <div
          id="solune-community-search-dock"
          className={`solune-community-search-dock${searchOpen ? " is-open" : ""}`}
          hidden={!searchOpen}
        >
          <div className="solune-shell">
            <form
              className="solune-community-search-panel"
              action={g5PathForRuntime("/search")}
              method="get"
              role="search"
            >
              <Search size={16} aria-hidden />
              <input ref={searchInputRef} type="search" name="q" placeholder="검색어를 입력하세요" aria-label="통합 검색" />
              <button type="submit">검색</button>
            </form>
          </div>
        </div>
      </div>

      <div id="wrapper" className="solune-wrapper">
        {showRail ? (
          <div className="solune-content-shell solune-inner-shell">
            <main id="main-content" className="solune-main-content" inert={drawerOpen || undefined}>
              {children}
            </main>
            <SoluneRail />
          </div>
        ) : (
          <main id="main-content" inert={drawerOpen || undefined}>
            {children}
          </main>
        )}
      </div>

      <ShellFooter config={config} />
    </div>
  );
}
