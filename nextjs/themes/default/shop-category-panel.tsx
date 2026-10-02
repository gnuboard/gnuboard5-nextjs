"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { BbsRewriteMode } from "@/lib/board-url";
import { normalizeG5ImageSrc } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import type { ShopCategory, ShopProduct } from "@/lib/shop-types";
import { getClientPublicSettings } from "@/services/settings";
import { getShopProducts } from "@/services/shop";
import { shopCategoryHref } from "./shop-links";
import { formatProductPrice } from "@/lib/shop-product-state";

/** 레퍼런스 solune_shop_category_picks() 와 같은 네 개. */
const PICK_COUNT = 4;

/**
 * 패널 오른쪽 아래 "SOLUNE PICK — {분류} 추천 상품" 칸. 2026-10-02 요청으로 잠시 감춘다(다시 넣거나 다른
 * 모양으로 바꿀 수 있어 코드는 그대로 둔다). true 로 바꾸면 돌아온다 — 끄는 동안은 추천 상품도 받지 않는다.
 */
const SHOW_CATEGORY_PICKS = false;

/** 단추에서 패널로 내려가는 순간 포인터가 잠깐 둘 다에서 벗어난다. 그 틈에 닫히지 않게 기다린다(레퍼런스 180ms). */
const HOVER_CLOSE_DELAY_MS = 180;

export type CategoryHoverHandlers = {
  /** 카테고리 단추 · 패널 알맹이에 얹으면 연다. */
  open: () => void;
  /** 헤더에서 나가거나 헤더의 다른 자리(로고 · 상품 유형 · 아이콘) · 뒷막에 얹으면 곧 닫는다. */
  closeSoon: () => void;
} | null;

/**
 * 레퍼런스 shop/category.php 의 hover 여닫기. 마우스처럼 얹을 수 있는 기기에서만 건다 —
 * 손가락에 걸면 한 번 누를 때 열림과 닫힘이 겹쳐 열리지 않는다. 그런 기기에서는 null 을 돌려주고,
 * 단추 클릭만으로 연다.
 */
export function useCategoryHover(setOpen: (open: boolean) => void): CategoryHoverHandlers {
  const [canHover, setCanHover] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    if (!query) return;
    const update = () => setCanHover(query.matches);
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!canHover) return null;
  return {
    open: () => {
      window.clearTimeout(timer.current);
      setOpen(true);
    },
    closeSoon: () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
    },
  };
}

/* 레퍼런스는 "추천(it_type2) 먼저, 모자라면 같은 분류의 나머지"를 한 쿼리로 고른다.
   API 에는 그 정렬이 없어 추천만 먼저 받고, 모자랄 때만 한 번 더 받아 채운다. */
async function loadCategoryPicks(caId: string): Promise<ShopProduct[]> {
  const recommended = await getShopProducts({ ca_id: caId, it_type2: 1, per_page: PICK_COUNT }, 0);
  if (recommended.length >= PICK_COUNT) return recommended.slice(0, PICK_COUNT);
  const rest = await getShopProducts({ ca_id: caId, per_page: PICK_COUNT }, 0);
  const seen = new Set(recommended.map((product) => product.it_id));
  return [...recommended, ...rest.filter((product) => !seen.has(product.it_id))].slice(0, PICK_COUNT);
}

type PickState = { status: "loading" } | { status: "done"; products: ShopProduct[] };

/* 고른 큰 분류의 추천 상품. 패널이 열려 있을 때만, 분류마다 한 번만 받는다.
   getShopProducts 는 실패해도 빈 목록을 돌려주어 "실패"와 "상품 없음"을 가를 수 없다 — 빈 결과는
   이번에 연 동안만 기억하고, 패널을 닫았다 다시 열면 그 분류를 한 번 더 받는다. */
function useCategoryPicks(caId: string | undefined, enabled: boolean): PickState | undefined {
  const [picks, setPicks] = useState<Record<string, PickState>>({});
  const requested = useRef(new Set<string>());
  const emptyThisOpen = useRef(new Set<string>());

  useEffect(() => {
    if (enabled) return;
    emptyThisOpen.current.forEach((id) => requested.current.delete(id));
    emptyThisOpen.current.clear();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !caId || requested.current.has(caId)) return;
    requested.current.add(caId);
    setPicks((current) => ({ ...current, [caId]: { status: "loading" } }));
    void loadCategoryPicks(caId).then((products) => {
      if (products.length === 0) emptyThisOpen.current.add(caId);
      setPicks((current) => ({ ...current, [caId]: { status: "done", products } }));
    });
  }, [caId, enabled]);

  return caId ? picks[caId] : undefined;
}

/* 상품 주소가 짧은 주소 설정을 따르도록 한 번만 읽는다(홈 화면과 같은 값). */
function useRewriteMode(enabled: boolean): BbsRewriteMode {
  const [mode, setMode] = useState<BbsRewriteMode>(0);
  const loaded = useRef(false);
  useEffect(() => {
    if (!enabled || loaded.current) return;
    loaded.current = true;
    getClientPublicSettings()
      .then((settings) => setMode(settings?.cf_bbs_rewrite ?? 0))
      .catch(() => {
        // 읽지 못하면 기본 주소(0)로 둔다.
      });
  }, [enabled]);
  return mode;
}

function CategoryPicks({
  root,
  state,
  rewriteMode,
  onNavigate,
}: {
  root: ShopCategory;
  state: PickState | undefined;
  rewriteMode: BbsRewriteMode;
  onNavigate: () => void;
}) {
  const titleId = `solune-cat-picks-title-${root.ca_id}`;
  const products = state?.status === "done" ? state.products : [];

  return (
    <section className="solune-shop-category-picks" aria-labelledby={titleId}>
      <div className="solune-shop-category-picks-head">
        <div>
          <span className="solune-shop-category-picks-eyebrow">SOLUNE PICK</span>
          <h3 id={titleId}>{root.ca_name} 추천 상품</h3>
        </div>
        <Link className="solune-shop-category-picks-all" href={shopCategoryHref(root)} onClick={onNavigate}>
          추천 상품 전체 보기 <span aria-hidden>›</span>
        </Link>
      </div>
      {state?.status !== "done" ? (
        <ul className="solune-shop-category-picks-list" aria-busy="true">
          {Array.from({ length: PICK_COUNT }, (_, index) => (
            <li key={index} className="solune-shop-category-pick-skeleton" aria-hidden />
          ))}
        </ul>
      ) : products.length === 0 ? (
        <div className="solune-shop-category-picks-empty">
          <span>아직 이 분류에 보여 줄 상품이 없습니다.</span>
          <Link href={shopCategoryHref(root)} onClick={onNavigate}>
            분류 보기
          </Link>
        </div>
      ) : (
        <ul className="solune-shop-category-picks-list">
          {products.map((product) => {
            const image = normalizeG5ImageSrc(product.image_url);
            return (
              <li key={product.it_id}>
                <Link
                  className="solune-shop-category-pick"
                  href={shopProductHref(product, rewriteMode)}
                  onClick={onNavigate}
                >
                  <span className="solune-shop-category-pick-image">
                    {image ? (
                      /* 정적 설치본은 이미지 최적화 서버가 없다 — 작은 미리보기라 원본을 그대로 쓴다. */
                      <img src={image} alt="" loading="lazy" decoding="async" width={240} height={240} />
                    ) : (
                      <ProductImageFallback compact />
                    )}
                  </span>
                  <span className="solune-shop-category-pick-name">{product.it_name}</span>
                  <span className="solune-shop-category-pick-price">
                    {formatProductPrice(product)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * 헤더 "카테고리" 펼침 메뉴 — 레퍼런스 shop/category.php 의 두 칸 패널.
 * 왼쪽: 큰 분류 탭(세로 이름표 줄). 오른쪽: 고른 분류의 이름 · 전체 보기 · 하위 분류 · 추천 상품 넷.
 * 640px 이상에서만 쓴다. 그 아래는 로고 왼쪽 햄버거가 여는 서랍(shop-drawer.tsx)이 분류를 맡는다.
 * 여닫기: 단추 클릭 · Esc, 마우스 기기에서는 hover(useCategoryHover).
 */
export function SoluneShopCategoryPanel({
  categories,
  open,
  onClose,
  hover = null,
}: {
  categories: ShopCategory[];
  open: boolean;
  onClose: () => void;
  hover?: CategoryHoverHandlers;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const safeIndex = Math.min(activeIndex, Math.max(0, categories.length - 1));
  const active = categories[safeIndex];
  const picks = useCategoryPicks(active?.ca_id, open && SHOW_CATEGORY_PICKS);
  const rewriteMode = useRewriteMode(open && SHOW_CATEGORY_PICKS);

  // 세로 탭 목록의 키보드: 위/아래 · Home/End 로 옮기고 바로 고른다(WAI-ARIA 탭 패턴).
  const onRailKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = categories.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: safeIndex >= last ? 0 : safeIndex + 1,
      ArrowUp: safeIndex <= 0 ? last : safeIndex - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActiveIndex(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      id="solune-shop-category"
      className={`solune-shop-category${open ? " is-open" : ""}`}
      aria-hidden={!open}
    >
      <div className="solune-shop-category-backdrop" onClick={onClose} onMouseEnter={hover?.closeSoon} />
      <div
        className="solune-shop-shell solune-shop-category-panel"
        onMouseEnter={hover?.open}
        role="dialog"
        aria-modal="true"
        aria-labelledby="solune-shop-category-title"
      >
        <div className="solune-shop-category-head">
          <h2 id="solune-shop-category-title">상품 카테고리</h2>
          <button type="button" className="solune-shop-category-close" onClick={onClose} aria-label="카테고리 닫기">
            <X size={18} aria-hidden />
          </button>
        </div>

        {categories.length === 0 ? (
          <p className="solune-shop-category-empty">등록된 분류가 없습니다.</p>
        ) : (
          <div className="solune-shop-category-split">
            <ul
              className="solune-shop-category-rail"
              role="tablist"
              aria-label="큰 분류"
              aria-orientation="vertical"
              onKeyDown={onRailKeyDown}
            >
              {categories.map((root, index) => (
                <li key={root.ca_id} role="presentation">
                  <button
                    ref={(node) => {
                      tabRefs.current[index] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`solune-cat-tab-${root.ca_id}`}
                    aria-controls={`solune-cat-pane-${root.ca_id}`}
                    aria-selected={index === safeIndex}
                    tabIndex={index === safeIndex ? 0 : -1}
                    onClick={() => setActiveIndex(index)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {root.ca_name}
                    <span className="solune-shop-category-caret" aria-hidden>›</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="solune-shop-category-panes">
              {categories.map((root, index) => {
                const isActive = index === safeIndex;
                return (
                  <section
                    key={root.ca_id}
                    className={`solune-shop-category-pane${isActive ? "" : " is-off"}`}
                    id={`solune-cat-pane-${root.ca_id}`}
                    role="tabpanel"
                    aria-labelledby={`solune-cat-tab-${root.ca_id}`}
                  >
                    <div className="solune-shop-category-pane-head">
                      <span className="solune-shop-category-pane-name">{root.ca_name}</span>
                      <Link className="solune-shop-category-all" href={shopCategoryHref(root)} onClick={onClose}>
                        전체 보기 <span aria-hidden>›</span>
                      </Link>
                    </div>
                    {root.children && root.children.length > 0 ? (
                      <ul className="solune-shop-category-subs">
                        {root.children.map((child) => (
                          <li key={child.ca_id}>
                            <Link href={shopCategoryHref(child)} onClick={onClose}>
                              {child.ca_name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="solune-shop-category-none">하위 분류가 없습니다.</p>
                    )}
                    {SHOW_CATEGORY_PICKS && isActive ? (
                      <CategoryPicks root={root} state={picks} rewriteMode={rewriteMode} onNavigate={onClose} />
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
