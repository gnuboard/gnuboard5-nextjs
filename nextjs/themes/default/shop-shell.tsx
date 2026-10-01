"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { g5PathForRuntime } from "@/lib/config";
import { G5_SHOP_LOGO, SoluneBrandLogo } from "./brand-logo";
import { SoluneCompanyInfo, useSoluneCompany } from "./site-company";
import type { ShopCategory } from "@/lib/shop-types";
import { getShopCategories } from "@/services/shop";
import type { G5ThemeConfig, G5ThemeLayoutShellProps } from "@/lib/theme-types";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { ServiceSwitch } from "./layout-shell";
import { shopTypeHref } from "./shop-links";
import { SoluneShopCategoryPanel, useCategoryHover } from "./shop-category-panel";
import { SoluneShopDrawer, type ShopTypeLink } from "./shop-drawer";
import { soluneThemeBootScript } from "./theme-swap";
import { useLoginHref } from "./use-runtime-pathname";

/* 레퍼런스 shop.head.php 의 유형 내비. 마지막(할인)은 CSS 가 테라코타로 세운다. */
const TYPE_LINKS: ShopTypeLink[] = [
  { label: "히트상품", type: 1 },
  { label: "추천상품", type: 2 },
  { label: "최신상품", type: 3 },
  { label: "인기상품", type: 4 },
  { label: "할인상품", type: 5 },
];

/** 분류를 다시 받아 보는 때(ms). getShopCategories 는 실패해도 빈 목록을 돌려주어 "실패"와
 *  "정말 분류가 없음"을 가를 수 없다 — 비어 있으면 몇 번만 더 받아 본다. */
const CATEGORY_RETRY_DELAYS_MS = [0, 2000, 6000];

/* 정적 빌드는 빌드하는 순간의 분류를 HTML 에 굽는다. 빌드 때 API 가 없거나(배포판을 만드는 곳)
   설치한 사이트의 분류가 다르면 빈 목록이 박혀 헤더의 "카테고리" 패널이 "등록된 분류가 없습니다"가
   된다. 받은 것이 비어 있으면 브라우저에서 이 사이트의 분류를 받는다(홈 아이콘 줄과 같은 API).
   일시적인 실패에 대비해 비어 있으면 정해진 횟수만 다시 받고, 오프라인에서 돌아오면 한 번 더 받는다. */
function useRuntimeShopCategories(built: ShopCategory[]): ShopCategory[] {
  const [fetched, setFetched] = useState<ShopCategory[] | null>(null);
  const needsFetch = built.length === 0;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;

    const load = () => {
      window.clearTimeout(timer);
      void getShopCategories(0).then((list) => {
        if (cancelled) return;
        if (list.length > 0) {
          setFetched(list);
          return;
        }
        attempt += 1;
        const delay = CATEGORY_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) timer = window.setTimeout(load, delay);
      });
    };
    const onOnline = () => {
      attempt = 0;
      load();
    };

    load();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [needsFetch]);

  return needsFetch ? fetched ?? built : built;
}

/** 서랍 · 펼침 패널이 갈리는 폭. theme.shop.category.css 의 639/640px 과 같다. */
const WIDE_SHOP_HEADER_QUERY = "(min-width: 640px)";

/* 상품 분류 목록. 셸이 서버에서 받아 두고, 목록 머리(shop-list-header)의
   빵부스러기가 같은 층의 형제 분류를 고르는 데 쓴다. 머리 슬롯은 자기 분류와
   하위 분류만 받으므로 형제는 여기서 얻는 수밖에 없다. */
const ShopCategoriesContext = createContext<ShopCategory[]>([]);

export function useSoluneShopCategories(): ShopCategory[] {
  return useContext(ShopCategoriesContext);
}

const FOOTER_LINKS = [
  { label: "회사소개", href: "/content/company" },
  { label: "개인정보처리방침", href: "/content/privacy" },
  { label: "이용약관", href: "/content/provision" },
];

/** 헤더가 한 단 낮아지는 스크롤 문턱. 레퍼런스 theme.js 와 같은 70px. */
const SHRINK_AT = 70;

function CartLink() {
  const { totalQty, fetchCart } = useCartStore();

  // greenhub 의 CartButton 과 같은 방식: 첫 마운트와 cart:changed 이벤트에서 다시 센다.
  useEffect(() => {
    // 붙는 순간에는 "지금 담긴 수"만 필요하다. 머리글 카트가 둘(앱 머리글·쇼핑 머리글)이라
    // 같은 요청이 두 번 나갔다. 변경 알림에는 그대로 강제로 다시 받는다.
    void fetchCart({ dedupe: true });
    const onChanged = () => void fetchCart();
    window.addEventListener("cart:changed", onChanged);
    return () => window.removeEventListener("cart:changed", onChanged);
  }, [fetchCart]);

  // 이름에 보이는 숫자를 그대로 넣는다 — "장바구니 0" 처럼. 보이는 글자가 이름에 없으면 label-in-name 검사에 걸린다.
  return (
    <Link href="/shop/cart" className="solune-shop-cart" aria-label={`장바구니 ${totalQty > 99 ? "99+" : totalQty}`}>
      <ShoppingBag size={15} aria-hidden />
      <span className="solune-shop-cart-count">{totalQty > 99 ? "99+" : totalQty}</span>
    </Link>
  );
}

/* 레퍼런스 shop.tail.php: [사이트 이름 · 한 줄 소개 ………… 푸터 메뉴] / 사이트 정보(사업자 정보) / 저작권.
   사업자 정보가 없는 설치본은 테마 설정의 고객센터 안내 한 줄로 대신한다. */
function ShopFooter({ config }: { config: G5ThemeConfig }) {
  const company = useSoluneCompany();
  const owner = company?.name || config.site.copyrightName;

  return (
    <footer className="solune-shop-footer">
      <div className="solune-shop-shell solune-shop-footer-inner">
        <div className="solune-shop-footer-brand">
          <Link href="/shop" aria-label={`${config.site.name} 쇼핑몰 홈`}>
            <span className="solune-shop-footer-name">{config.site.name}</span>
          </Link>
          <p>Solune가 고른 상품과 더 나은 쇼핑 경험을 만나보세요.</p>
        </div>
        <nav className="solune-shop-footer-links" aria-label="푸터 메뉴">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        {company ? (
          <SoluneCompanyInfo company={company} variant="shop" className="solune-shop-footer-company" />
        ) : (
          <div className="solune-shop-footer-info">
            <span>{config.site.copyrightName}</span>
            {config.site.customerCenterLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        )}
        <p className="solune-shop-footer-copy">
          Copyright © {new Date().getFullYear()} {owner}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/**
 * 쇼핑몰 셸. 레퍼런스 shop.head.php / shop.tail.php 의 구조 그대로다 —
 * 서비스 전환 바 · 고정 헤더(로고 · 카테고리 · 유형 내비 · 검색/계정/장바구니)
 * · 검색 독 · 본문 · 푸터. 커뮤니티 셸(SoluneLayoutShell)은 /shop 에서
 * 자기 크롬을 그리지 않으므로 여기가 유일한 껍데기다.
 */
export function SoluneShopLayoutShell({ children, config, shopCategories: builtCategories = [] }: G5ThemeLayoutShellProps) {
  const loginHref = useLoginHref();
  const { isInitialized, user } = useAuthStore();
  const shopCategories = useRuntimeShopCategories(builtCategories);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const hover = useCategoryHover(setCategoryOpen);
  const categoryToggleRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const [shrunk, setShrunk] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setShrunk(window.scrollY > SHRINK_AT);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!categoryOpen && !searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCategoryOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [categoryOpen, searchOpen]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // 640px 경계를 넘으면 그 폭에 없는 쪽을 닫는다. 열린 서랍이 CSS 로 숨은 채 남으면
  // 본문 스크롤이 잠긴 채 풀리지 않고, 다시 좁히면 서랍이 열린 채 나타난다.
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_SHOP_HEADER_QUERY);
    if (!query) return;
    const onChange = () => {
      if (query.matches) setDrawerOpen(false);
      else setCategoryOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // 키보드로 연 패널은 탭으로 단추 · 패널 밖에 나가면 닫는다(레퍼런스 category.php 와 같다).
  useEffect(() => {
    if (!categoryOpen) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      const panel = document.getElementById("solune-shop-category");
      if (target && (categoryToggleRef.current?.contains(target) || panel?.contains(target))) return;
      setCategoryOpen(false);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [categoryOpen]);

  const signedIn = isInitialized && Boolean(user);

  return (
    <div className={`solune-shop-page solune-page${searchOpen ? " solune-search-active" : ""}`}>
      <script dangerouslySetInnerHTML={{ __html: soluneThemeBootScript }} />

      {/* 고정 헤더 밖에 둔다 — 서랍은 position:fixed 라 transform 이 걸린 조상 안이면 화면이 아니라 그 상자에 갇힌다. */}
      <SoluneShopDrawer
        config={config}
        categories={shopCategories}
        typeLinks={TYPE_LINKS}
        open={drawerOpen}
        onClose={closeDrawer}
      />

      <div className={`solune-shop-header-sticky${shrunk ? " is-shrunk" : ""}`}>
        <div className="solune-shop-header-shell">
          <ServiceSwitch isShop shellClassName="solune-shop-shell" />
        </div>

        <header className="solune-shop-header" onMouseLeave={hover?.closeSoon}>
          <div className="solune-shop-shell solune-shop-mainbar">
            {/* 좁은 화면의 햄버거 — 로고 왼쪽 첫 칸. 넓은 화면에서는 CSS 가 접어 로고가 첫 칸에 선다. */}
            <button
              type="button"
              className="solune-shop-drawer-toggle"
              aria-label="메뉴 열기"
              aria-controls="solune-shop-drawer"
              aria-expanded={drawerOpen}
              onClick={() => {
                setCategoryOpen(false);
                setDrawerOpen(true);
              }}
            >
              <Menu size={20} aria-hidden />
            </button>
            <Link
              href="/shop"
              className="solune-shop-brand"
              onMouseEnter={hover?.closeSoon}
            >
              <SoluneBrandLogo src={G5_SHOP_LOGO} alt={`${config.site.name} 쇼핑몰`} width={167} height={33} />
            </Link>

            <div className="solune-shop-nav">
              <button
                ref={categoryToggleRef}
                type="button"
                className="solune-shop-category-toggle"
                aria-label="카테고리"
                aria-controls="solune-shop-category"
                aria-expanded={categoryOpen}
                onClick={() => setCategoryOpen((open) => !open)}
                onMouseEnter={hover?.open}
              >
                <Menu size={15} aria-hidden />
                <span>카테고리</span>
              </button>
              <nav className="solune-shop-type-nav" aria-label="상품 유형" onMouseEnter={hover?.closeSoon}>
                {TYPE_LINKS.map((link) => (
                  <Link key={link.type} href={shopTypeHref(link.type)}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="solune-shop-actions" onMouseEnter={hover?.closeSoon}>
              <button
                type="button"
                className="solune-shop-search-toggle"
                aria-controls="solune-search-dock"
                aria-expanded={searchOpen}
                aria-label={searchOpen ? "검색 닫기" : "검색 열기"}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search size={15} aria-hidden />
              </button>
              <Link href={signedIn ? "/mypage" : loginHref} className="solune-shop-account" aria-label={signedIn ? "마이페이지" : "로그인"}>
                <UserRound size={15} aria-hidden />
              </Link>
              <CartLink />
            </div>
          </div>
          <SoluneShopCategoryPanel
            categories={shopCategories}
            open={categoryOpen}
            onClose={() => setCategoryOpen(false)}
            hover={hover}
          />
        </header>

        <div id="solune-search-dock" className="solune-shop-search-dock" hidden={!searchOpen}>
          <div className="solune-shop-shell solune-shop-search-dock-inner">
            <form className="solune-shop-search" action={g5PathForRuntime("/shop/search")} method="get" role="search">
              <label className="sr-only" htmlFor="solune-shop-search-input">
                상품 검색어
              </label>
              <input
                ref={searchInputRef}
                id="solune-shop-search-input"
                type="search"
                name="q"
                placeholder="상품명이나 카테고리를 검색해 보세요"
                autoComplete="off"
              />
              <button type="submit" aria-label="상품 검색">
                <Search size={16} aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </div>
      <div className="solune-shop-header-spacer" aria-hidden />

      <div id="wrapper" className="solune-shop-wrapper">
        <div id="container" className="solune-shop-container">
          <main id="main-content" className="shop-content">
            <ShopCategoriesContext.Provider value={shopCategories}>{children}</ShopCategoriesContext.Provider>
          </main>
        </div>
      </div>

      <ShopFooter config={config} />
    </div>
  );
}
