"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, X } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopCategory } from "@/lib/shop-types";
import type { G5ThemeConfig } from "@/lib/theme-types";
import { G5_SHOP_LOGO, SoluneBrandLogo } from "./brand-logo";
import { shopCategoryHref, shopTypeHref } from "./shop-links";

export type ShopTypeLink = { label: string; type: number };

const FOCUSABLE = "a[href], button:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

/* 서랍 안에서 Tab 을 돌린다 — 끝에서 처음으로, Shift+Tab 은 처음에서 끝으로.
   바깥 형제는 inert 로 막지만 공용 레이아웃의 "본문 바로가기"처럼 body 바로 아래에 있는 것은
   셸 밖이라 닿지 않는다. 접힌 details 안의 링크처럼 보이지 않는 것은 뺀다. */
function keepTabInside(event: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !root.contains(active);
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault();
    first.focus();
  }
}

interface SoluneShopDrawerProps {
  config: G5ThemeConfig;
  categories: ShopCategory[];
  typeLinks: ShopTypeLink[];
  open: boolean;
  onClose: () => void;
}

/**
 * 좁은 화면(640px 미만)의 왼쪽 서랍 — 레퍼런스 shop.head.php 의 solune-shop-drawer.
 * 로고 왼쪽 햄버거를 누르면 열린다(hover 가 아니라 클릭). 큰 분류마다 접었다 펴는 목록
 * (첫 줄은 "전체 보기"), 그 아래 상품 유형. 넓은 화면에서는 CSS 가 감춘다.
 * 닫기: X · 뒷막 · Esc · 링크 누름. 열려 있는 동안 본문 스크롤을 막고, 닫히면 햄버거로 초점을 돌린다.
 */
export function SoluneShopDrawer({ config, categories, typeLinks, open, onClose }: SoluneShopDrawerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 모달이므로 서랍 밖(헤더 · 본문 · 푸터)을 잠시 inert 로 둔다 — Tab 이 서랍 밖으로 새지 않고
    // 화면 읽기 프로그램도 뒤 화면을 읽지 않는다. 원래 inert 였던 것은 건드리지 않는다.
    const outside = Array.from(rootRef.current?.parentElement?.children ?? []).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== rootRef.current && !element.inert
    );
    outside.forEach((element) => {
      element.inert = true;
    });
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab") keepTabInside(event, rootRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      outside.forEach((element) => {
        element.inert = false;
      });
      returnFocus?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div
      ref={rootRef}
      id="solune-shop-drawer"
      className={`solune-shop-drawer${open ? " is-open" : ""}`}
      inert={!open}
    >
      <div className="solune-shop-drawer-overlay" onClick={onClose} aria-hidden />
      <aside className="solune-shop-drawer-panel" role="dialog" aria-modal="true" aria-label="쇼핑몰 메뉴">
        <div className="solune-shop-drawer-head">
          <Link href="/shop" className="solune-shop-drawer-brand" onClick={onClose}>
            <SoluneBrandLogo src={G5_SHOP_LOGO} alt={`${config.site.name} 쇼핑몰`} width={167} height={33} />
          </Link>
          <button ref={closeRef} type="button" className="solune-shop-drawer-close" onClick={onClose} aria-label="메뉴 닫기">
            <X size={18} aria-hidden />
          </button>
        </div>

        <nav className="solune-shop-drawer-nav" aria-label="쇼핑몰 메뉴">
          <p className="solune-shop-drawer-title" id="solune-shop-drawer-categories">상품 카테고리</p>
          {categories.length === 0 ? (
            <p className="solune-shop-drawer-empty">등록된 분류가 없습니다.</p>
          ) : (
            <ul className="solune-shop-drawer-menu" aria-labelledby="solune-shop-drawer-categories">
              {categories.map((root) =>
                root.children && root.children.length > 0 ? (
                  <li key={root.ca_id}>
                    <details>
                      <summary>
                        {root.ca_name}
                        <ChevronDown size={15} aria-hidden />
                      </summary>
                      <ul>
                        <li>
                          <Link
                            className="solune-shop-drawer-all"
                            href={shopCategoryHref(root)}
                            onClick={onClose}
                            aria-label={`${root.ca_name} 전체 보기`}
                          >
                            전체 보기
                          </Link>
                        </li>
                        {root.children.map((child) => (
                          <li key={child.ca_id}>
                            <Link href={shopCategoryHref(child)} onClick={onClose}>
                              {child.ca_name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ) : (
                  <li key={root.ca_id}>
                    <Link href={shopCategoryHref(root)} onClick={onClose}>
                      {root.ca_name}
                    </Link>
                  </li>
                )
              )}
            </ul>
          )}

          <p className="solune-shop-drawer-title" id="solune-shop-drawer-types">상품 유형</p>
          <ul className="solune-shop-drawer-menu" aria-labelledby="solune-shop-drawer-types">
            {typeLinks.map((link) => (
              <li key={link.type}>
                <Link href={shopTypeHref(link.type)} onClick={onClose}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
