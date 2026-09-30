"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Home, LayoutGrid, List } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import type { ShopCategory } from "@/lib/shop-types";
import type { G5ThemeShopListHeaderProps, ShopListView } from "@/lib/theme-types";
import { formatNumber } from "@/lib/utils";
import { shopCategoryHref } from "./shop-links";
import { useSoluneShopCategories } from "./shop-shell";

/** 레퍼런스 list.sort.skin.php 의 #ssch_sort — 값은 API 의 정렬 별칭이다. */
const SORTS = [
  { value: "sales", label: "판매많은순" },
  { value: "price_asc", label: "낮은가격순" },
  { value: "price_desc", label: "높은가격순" },
  { value: "rating", label: "평점높은순" },
  { value: "reviews", label: "후기많은순" },
  { value: "latest", label: "최근등록순" },
];

/** 영카트 분류 코드는 두 자리씩 깊어진다("10" → "1010" → "101010"). */
const CATEGORY_STEP = 2;

/** 레퍼런스 listcategory.skin.php 는 바로 아래 분류(ca_id 두 자리 더 긴 것)만 보여 준다. */
function directChildren(category: ShopCategory | null | undefined, subcategories: ShopCategory[]): ShopCategory[] {
  if (!category) return subcategories;
  const direct = subcategories.filter((sub) => sub.ca_id.length === category.ca_id.length + CATEGORY_STEP);
  return direct.length > 0 ? direct : subcategories;
}

/**
 * 빵부스러기 한 층. 영카트 #sct_location 의 select 를 옮긴 것이다 — 이 층의
 * 형제 분류를 펼쳐 보여 주고, 고르면 그 분류로 간다.
 */
function CrumbLevel({ current, siblings }: { current: ShopCategory; siblings: ShopCategory[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (siblings.length <= 1) {
    return <span className="solune-shop-crumb-current">{current.ca_name}</span>;
  }

  return (
    <div className={`solune-shop-crumb-level${open ? " is-open" : ""}`} ref={rootRef}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {current.ca_name}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <ul role="menu" aria-label={`${current.ca_name} 와 같은 층의 분류`}>
          {siblings.map((sibling) => (
            <li key={sibling.ca_id} role="none">
              <Link role="menuitem" href={shopCategoryHref(sibling)} aria-current={sibling.ca_id === current.ca_id ? "page" : undefined}>
                {sibling.ca_name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 현재 분류까지의 층들. 각 층은 자기 분류와 그 층의 형제들이다. */
function crumbLevels(category: ShopCategory, all: ShopCategory[]): Array<{ current: ShopCategory; siblings: ShopCategory[] }> {
  const levels: Array<{ current: ShopCategory; siblings: ShopCategory[] }> = [];
  for (let length = CATEGORY_STEP; length <= category.ca_id.length; length += CATEGORY_STEP) {
    const prefix = category.ca_id.slice(0, length);
    const parent = prefix.slice(0, length - CATEGORY_STEP);
    const current = all.find((item) => item.ca_id === prefix) ?? (prefix === category.ca_id ? category : null);
    if (!current) continue;
    const siblings = all.filter((item) => item.ca_id.length === length && item.ca_id.startsWith(parent));
    levels.push({ current, siblings: siblings.length > 0 ? siblings : [current] });
  }
  return levels;
}

function ViewToggle({ view, onChange }: { view: ShopListView; onChange: (view: ShopListView) => void }) {
  return (
    <ul className="solune-shop-viewtoggle" aria-label="목록 모양">
      <li>
        <button type="button" aria-pressed={view === "list"} aria-label="리스트뷰" onClick={() => onChange("list")}>
          <List size={15} aria-hidden />
        </button>
      </li>
      <li>
        <button type="button" aria-pressed={view === "grid"} aria-label="갤러리뷰" onClick={() => onChange("grid")}>
          <LayoutGrid size={15} aria-hidden />
        </button>
      </li>
    </ul>
  );
}

/**
 * 레퍼런스 상품 목록의 머리: `<분류> 상품리스트` 제목, #sct_location 의
 * 빵부스러기(집 › 분류 ▾), #sct_ct_1 의 하위 분류 알약(개수 포함), #sct_sortlst 의
 * 정렬 줄과 #sct_lst 의 리스트/갤러리 전환. 목록과 페이지 넘김은 앱이 그 아래에
 * 그리고, 줄 모양은 앱이 격자에 붙인 data-view 를 보고 테마 CSS 가 정한다.
 */
export function SoluneShopListHeader({
  title,
  category,
  subcategories,
  subcategoryHref,
  total,
  sort,
  onSortChange,
  filters,
  toolbar,
  view = "grid",
  onViewChange,
}: G5ThemeShopListHeaderProps) {
  const allCategories = useSoluneShopCategories();
  const children = directChildren(category, subcategories);
  const levels = category ? crumbLevels(category, allCategories) : [];

  return (
    <>
      <div className="solune-shop-page-title">
        <h1>{category ? `${category.ca_name} 상품리스트` : title}</h1>
      </div>

      <nav className="solune-shop-crumb" aria-label="현재 위치">
        <Link href="/shop" className="solune-shop-crumb-home" aria-label="쇼핑몰 메인으로">
          <Home size={14} aria-hidden />
        </Link>
        {levels.map((level) => (
          <span key={level.current.ca_id} className="solune-shop-crumb-item">
            <ChevronRight size={13} aria-hidden className="solune-shop-crumb-sep" />
            <CrumbLevel current={level.current} siblings={level.siblings} />
          </span>
        ))}
        {!category ? (
          <span className="solune-shop-crumb-item">
            <ChevronRight size={13} aria-hidden className="solune-shop-crumb-sep" />
            <span className="solune-shop-crumb-current">{title}</span>
          </span>
        ) : null}
      </nav>

      {children.length > 0 ? (
        <nav className="solune-shop-subcats" aria-label="하위 상품 분류">
          <ul>
            {children.map((sub) => (
              <li key={sub.ca_id}>
                <Link href={subcategoryHref(sub)}>
                  {sub.ca_name}
                  {typeof sub.item_count === "number" ? ` (${formatNumber(sub.item_count)})` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {filters ? <div className="solune-shop-list-filters">{filters}</div> : null}

      <div className="solune-shop-sortbar">
        <ul className="solune-shop-sorts" aria-label="상품 정렬">
          {SORTS.map((option) => (
            <li key={option.value}>
              <button type="button" aria-pressed={sort === option.value} onClick={() => onSortChange(option.value)}>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="solune-shop-sort-side">
          {toolbar}
          <span className="sct_nb">총 {formatNumber(total)}개</span>
          {onViewChange ? <ViewToggle view={view} onChange={onViewChange} /> : null}
        </div>
      </div>
    </>
  );
}
