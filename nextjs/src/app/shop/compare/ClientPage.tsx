"use client";

import { useEffect, useState } from "react";
import { G5Link as Link } from "@/components/ui/g5-link";
import Image from "next/image";
import { api } from "@/lib/api";
import type { ShopProduct } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { useCompareStore } from "@/store/compare";
import { formatPrice } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { getClientPublicSettings } from "@/services/settings";
import { GitCompare, X } from "lucide-react";
import { isTelInquiry, formatProductPrice } from "@/lib/shop-product-state";

/**
 * 상품 비교 — compare store 의 it_id 목록을 다시 fetch 해 표 형태로 표시.
 * 가격/브랜드/카테고리/재고/포인트 컬럼별 비교.
 */
export default function CompareePage() {
  const { items: tray, remove, clear } = useCompareStore();
  const [details, setDetails] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);

  useEffect(() => {
    applyClientPageMetadata({
      title: "상품 비교",
      description: "선택한 상품의 가격, 카테고리, 재고 정보를 비교하세요.",
      path: "/shop/compare",
    });
  }, []);

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

  useEffect(() => {
    let alive = true;

    if (tray.length === 0) {
      setDetails([]);
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    Promise.all(
      tray.map((t) =>
        api
          .get<ShopProduct>(`/shop/products/${encodeURIComponent(t.it_id)}`)
          .then((r) => (r.data as ShopProduct) || null)
          .catch(() => null)
      )
    )
      .then((rows) => {
        if (alive) setDetails(rows.filter(Boolean) as ShopProduct[]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [tray]);

  if (tray.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <GitCompare className="mb-4 h-16 w-16 text-muted-foreground/40" />
        <p>비교할 상품이 없습니다.</p>
        <Link href="/shop/products" className="mt-4 text-sm text-primary hover:underline">
          상품 목록으로 →
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-6">
        <div className="skeleton h-32 rounded-lg" />
      </div>
    );
  }

  // 비교 항목 — 가로 헤더(상품), 세로 row(속성).
  const rows: { label: string; render: (p: ShopProduct) => React.ReactNode }[] = [
    {
      label: "가격",
      render: (p) => (
        <span className="font-bold text-primary">
          {formatProductPrice(p)}
        </span>
      ),
    },
    {
      label: "정가",
      render: (p) =>
        !isTelInquiry(p) && p.it_cust_price > 0 ? (
          <span className="text-muted-foreground line-through">{formatPrice(p.it_cust_price)}</span>
        ) : <span className="text-muted-foreground">-</span>,
    },
    { label: "카테고리", render: (p) => p.ca_name || "-" },
    { label: "브랜드", render: (p) => p.it_brand || "-" },
    { label: "제조사", render: (p) => p.it_maker || "-" },
    { label: "원산지", render: (p) => p.it_origin || "-" },
    {
      label: "재고",
      render: (p) =>
        p.it_soldout === "1" ? (
          <span className="text-red-700">품절</span>
        ) : p.it_stock_qty > 0 ? (
          `${p.it_stock_qty}개`
        ) : (
          <span className="text-muted-foreground">충분</span>
        ),
    },
    {
      label: "포인트",
      render: (p) => (p.it_point ? `${p.it_point.toLocaleString()}점` : "-"),
    },
    {
      label: "후기 평점",
      render: (p) =>
        p.review_count && p.review_count > 0 ? `${p.review_avg ?? 0} (${p.review_count})` : "-",
    },
  ];

  return (
    <div>
      <Breadcrumb items={[{ label: "쇼핑몰", href: "/shop" }, { label: "비교" }]} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">상품 비교</h1>
        <Button variant="outline" size="sm" onClick={clear}>
          전체 해제
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr>
              <th className="w-24 border-b p-2 text-left text-xs font-medium text-muted-foreground">
                항목
              </th>
              {details.map((p) => (
                <th key={p.it_id} className="border-b p-2 text-center">
                  <a href={shopProductHref(p, productRewriteMode)} className="block">
                    <div className="relative mx-auto aspect-square w-24 overflow-hidden rounded-md bg-muted">
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt={p.it_name}
                          fill
                          sizes="96px"
                          className="object-cover"
                          unoptimized={shouldBypassImageOptimization(p.image_url)}
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium hover:text-primary">
                      {p.it_name}
                    </p>
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(p.it_id)}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                    해제
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b">
                <th className="bg-muted/30 p-2 text-left text-xs font-medium text-muted-foreground">
                  {row.label}
                </th>
                {details.map((p) => (
                  <td key={p.it_id} className="p-2 text-center text-sm">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
