"use client";

import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ShopCategory, ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { ProductCard } from "@/components/shop/ProductGridSection";
import { useShopListView } from "@/hooks/useShopListView";
import { useThemeSlot } from "@/components/providers/ThemeSlotsProvider";
import { StaticFallbackNotice } from "@/components/StaticFallbackNotice";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { g5ShortHref } from "@/lib/g5-short-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { cn } from "@/lib/utils";
import { getShopCategoryProductPage } from "@/services/shop";
import { categoryPageParams } from "@/lib/route-data-prefetch-target";
import { getClientPublicSettings } from "@/services/settings";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { g5PathForRuntime } from "@/lib/config";

const SORT_OPTIONS = [
  { value: "", label: "기본순" },
  { value: "latest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "price_asc", label: "낮은 가격순" },
  { value: "price_desc", label: "높은 가격순" },
];

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="product-card">
          <div className="skeleton aspect-square rounded-[6px]" />
          <div className="mt-3 space-y-2">
            <div className="skeleton h-3 w-14 rounded" />
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-2/3 rounded" />
            <div className="skeleton h-5 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CategoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ca_id = useRuntimeRouteParam("ca_id", [
    "/shop/categories/:ca_id",
    "/shop/list-:ca_id",
  ]);
  const routeReady = useRuntimeRouteReady();

  const [category, setCategory] = useState<ShopCategory | null>(null);
  const [subcategories, setSubcategories] = useState<ShopCategory[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const previousCategoryRef = useRef<string | null>(null);
  const [meta, setMeta] = useState({
    total: 0,
    current_page: 1,
    last_page: 1,
  });

  const currentPage = Number(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "";
  const sortodr = searchParams.get("sortodr") || "";
  const themeShopListHeader = useThemeSlot("ShopListHeader");
  const [listView, setListView] = useShopListView();

  useEffect(() => {
    if (!ca_id) return;

    const previousCategory = previousCategoryRef.current;
    previousCategoryRef.current = ca_id;

    if (previousCategory && previousCategory !== ca_id && currentPage > 1) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      const search = params.toString();
      runtimeRouterPush(router, g5ShortHref(`/shop/categories/${ca_id}${search ? `?${search}` : ""}`));
    }
  }, [ca_id, currentPage, router, searchParams]);

  useEffect(() => {
    let alive = true;
    getClientPublicSettings()
      .then((settings) => {
        if (alive) setProductRewriteMode(settings.cf_bbs_rewrite);
      })
      .catch(() => {
        if (alive) setProductRewriteMode(0);
      });

    return () => {
      alive = false;
    };
  }, []);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      const search = params.toString();
      runtimeRouterPush(router, g5ShortHref(`/shop/categories/${ca_id}${search ? `?${search}` : ""}`));
    },
    [router, searchParams, ca_id]
  );

  useEffect(() => {
    if (!ca_id) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setCategory(null);
      setSubcategories([]);
      setProducts([]);
      setErrorMessage("카테고리를 찾을 수 없습니다");
      setMeta({ total: 0, current_page: 1, last_page: 1 });
      setLoading(false);
      return;
    }

    let alive = true;

    const loadCategory = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        // 링크에 마우스를 올렸을 때 미리 부른 요청(route-data-prefetch)과 같은 인자여야 그 결과를 받아 쓴다.
        const params = categoryPageParams(new URLSearchParams({ page: String(currentPage), sort, sortodr }));
        const data = await getShopCategoryProductPage(ca_id, params);
        if (!alive) return;

        if (!data) {
          setCategory(null);
          setSubcategories([]);
          setProducts([]);
          setErrorMessage("카테고리를 찾을 수 없습니다");
          setMeta({ total: 0, current_page: 1, last_page: 1 });
          return;
        }
        setCategory(data.category);
        setSubcategories(data.subcategories);
        setProducts(data.items);
        setErrorMessage("");
        setMeta({
          total: data.meta.total,
          current_page: data.meta.current_page,
          last_page: data.meta.last_page,
        });
      } catch (err: unknown) {
        if (!alive) return;
        setCategory(null);
        setSubcategories([]);
        setProducts([]);
        setErrorMessage(err instanceof Error ? err.message : "카테고리를 불러오지 못했습니다");
        setMeta({ total: 0, current_page: 1, last_page: 1 });
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadCategory();

    return () => {
      alive = false;
    };
  }, [ca_id, currentPage, routeReady, sort, sortodr]);

  useEffect(() => {
    if (!category) return;

    applyClientPageMetadata({
      title: category.ca_name,
      description: `${category.ca_name} 카테고리에서 ${meta.total}개의 상품을 확인하세요.`,
      path: `/shop/categories/${category.ca_id}`,
    });
  }, [category, meta.total]);

  if (loading) {
    return (
      <div>
        <div className="page-hero mb-5">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton mt-3 h-8 w-56 rounded" />
          <div className="skeleton mt-2 h-4 w-72 max-w-full rounded" />
        </div>
        <ProductGridSkeleton />
      </div>
    );
  }

  if (!category && errorMessage) {
    return (
      <div className="surface-panel flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-bold">{errorMessage}</p>
        {!ca_id ? <StaticFallbackNotice kind="category" className="max-w-md" /> : null}
        <Button variant="outline" className="mt-4" asChild>
          <a href={g5PathForRuntime("/shop")}>쇼핑몰로 이동</a>
        </Button>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="surface-panel flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-bold">카테고리를 찾을 수 없습니다</p>
        {!ca_id ? <StaticFallbackNotice kind="category" className="max-w-md" /> : null}
        <Button variant="outline" className="mt-4" asChild>
          <a href={g5PathForRuntime("/shop")}>쇼핑몰로 이동</a>
        </Button>
      </div>
    );
  }

  const pages: number[] = [];
  const start = Math.max(1, meta.current_page - 2);
  const end = Math.min(meta.last_page, meta.current_page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div>
      {themeShopListHeader ? (
        createElement(themeShopListHeader, {
          title: category.ca_name,
          category,
          subcategories,
          subcategoryHref: (sub) => g5ShortHref(`/shop/categories/${sub.ca_id}`),
          total: meta.total,
          sort,
          onSortChange: (value) => updateParams({ sort: value, sortodr: "", page: "1" }),
          view: listView,
          onViewChange: setListView,
        })
      ) : (
        <>
        <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: category.ca_name }]} />

        <section className="page-hero mb-4">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">상품 카테고리</p>
              <h1 className="page-hero-title">{category.ca_name}</h1>
              <p className="page-hero-desc">총 {meta.total.toLocaleString("ko-KR")}개의 상품이 있습니다.</p>
            </div>
            <select
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value, sortodr: "", page: "1" })}
              className="h-10 rounded-[4px] border bg-background px-3 text-sm outline-none"
              aria-label="상품 정렬"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {subcategories.length > 0 && (
          <div className="surface-toolbar mb-5">
            <div className="flex flex-wrap gap-2">
              <a
                href={g5ShortHref(`/shop/categories/${ca_id}`)}
                className={cn("filter-chip", !searchParams.get("sub") && "filter-chip-active")}
              >
                전체
              </a>
              {subcategories.map((sub) => (
                <a key={sub.ca_id} href={g5ShortHref(`/shop/categories/${sub.ca_id}`)} className="filter-chip">
                  {sub.ca_name}
                </a>
              ))}
            </div>
          </div>
        )}
        </>
      )}

      {products.length === 0 ? (
        <div className="surface-panel flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-bold text-muted-foreground">이 카테고리에는 상품이 없습니다</p>
        </div>
      ) : (
        <div className="shop-product-list grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" data-view={listView}>
          {products.map((product, index) => (
            <ProductCard
              key={product.it_id}
              product={product}
              priority={index < 4}
              productRewriteMode={productRewriteMode}
            />
          ))}
        </div>
      )}

      {meta.last_page > 1 && (
        <div className="mt-8 flex items-center justify-center gap-1">
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage <= 1}
            onClick={() => updateParams({ page: String(currentPage - 1) })}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {start > 1 && (
            <>
              <Button variant="outline" size="sm" onClick={() => updateParams({ page: "1" })}>
                1
              </Button>
              {start > 2 && <span className="px-1 text-muted-foreground">...</span>}
            </>
          )}
          {pages.map((p) => (
            <Button
              key={p}
              variant={p === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => updateParams({ page: String(p) })}
            >
              {p}
            </Button>
          ))}
          {end < meta.last_page && (
            <>
              {end < meta.last_page - 1 && <span className="px-1 text-muted-foreground">...</span>}
              <Button variant="outline" size="sm" onClick={() => updateParams({ page: String(meta.last_page) })}>
                {meta.last_page}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage >= meta.last_page}
            onClick={() => updateParams({ page: String(currentPage + 1) })}
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
