"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { BbsRewriteMode } from "@/lib/board-url";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { SafeHtml } from "@/components/SafeHtml";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ProductImageFallback } from "@/components/shop/ProductImageFallback";
import { StaticFallbackNotice } from "@/components/StaticFallbackNotice";
import { formatPrice } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image";
import { shopProductHref } from "@/lib/product-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { getClientPublicSettings } from "@/services/settings";
import { Sparkles } from "lucide-react";
import { g5PathForRuntime } from "@/lib/config";

interface EventProduct {
  it_id: string;
  ca_id: string;
  it_name: string;
  it_seo_title?: string;
  it_price: number;
  it_cust_price: number;
  it_stock_qty: number;
  it_soldout: string;
  it_tel_inq?: string;
  it_type1?: string;
  it_type2?: string;
  it_type4?: string;
  it_type5?: string;
  image_url: string;
}

interface EventDetail {
  ev_id: number;
  ev_subject: string;
  ev_subject_strong: number;
  ev_head_image_url?: string;
  ev_head_html: string;
  ev_tail_html: string;
  ev_tail_image_url?: string;
  products: EventProduct[];
}

const SORT_OPTIONS = [
  { value: "", sort: "", sortodr: "", label: "기본순" },
  { value: "it_sum_qty:desc", sort: "it_sum_qty", sortodr: "desc", label: "판매많은순" },
  { value: "it_price:asc", sort: "it_price", sortodr: "asc", label: "낮은가격순" },
  { value: "it_price:desc", sort: "it_price", sortodr: "desc", label: "높은가격순" },
  { value: "it_use_avg:desc", sort: "it_use_avg", sortodr: "desc", label: "평점높은순" },
  { value: "it_use_cnt:desc", sort: "it_use_cnt", sortodr: "desc", label: "후기많은순" },
  { value: "it_update_time:desc", sort: "it_update_time", sortodr: "desc", label: "최근등록순" },
];

function defaultSortDirection(sort: string) {
  return sort === "it_name" || sort === "it_price" ? "asc" : "desc";
}

function selectedSortValue(sort: string, sortodr: string) {
  if (!sort) return "";
  const key = `${sort}:${sortodr || defaultSortDirection(sort)}`;
  return SORT_OPTIONS.some((option) => option.value === key) ? key : "";
}

export default function EventDetailPage() {
  const ev_id = useRuntimeRouteParam("ev_id", "/shop/events/:ev_id");
  const routeReady = useRuntimeRouteReady();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [productRewriteMode, setProductRewriteMode] = useState<BbsRewriteMode>(0);
  const sort = searchParams.get("sort") || "";
  const sortodr = searchParams.get("sortodr") || "";

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
    if (!ev_id) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setEvent(null);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    api
      .get<EventDetail>(`/shop/events/${encodeURIComponent(ev_id)}`, {
        params: {
          ...(sort ? { sort } : {}),
          ...(sortodr ? { sortodr } : {}),
        },
      })
      .then((res) => {
        if (alive) setEvent((res.data as EventDetail) ?? null);
      })
      .catch(() => {
        if (alive) setEvent(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [ev_id, routeReady, sort, sortodr]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-40 rounded" />
        <div className="skeleton h-32 rounded-lg" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center py-16 text-muted-foreground">
        <Sparkles className="mb-4 h-16 w-16 text-muted-foreground/40" />
        <p>기획전을 찾을 수 없습니다.</p>
        {!ev_id ? <StaticFallbackNotice kind="event" className="max-w-md text-base-content" /> : null}
        <a href={g5PathForRuntime("/shop/events")} className="mt-4 text-sm text-primary hover:underline">
          기획전 목록으로 →
        </a>
      </div>
    );
  }

  const updateSort = (value: string) => {
    if (!ev_id) return;

    const option = SORT_OPTIONS.find((item) => item.value === value) || SORT_OPTIONS[0];
    const params = new URLSearchParams(searchParams.toString());
    if (option.sort) params.set("sort", option.sort);
    else params.delete("sort");
    if (option.sortodr) params.set("sortodr", option.sortodr);
    else params.delete("sortodr");
    const search = params.toString();
    runtimeRouterPush(router, `/shop/events/${ev_id}${search ? `?${search}` : ""}`);
  };

  return (
    <div>
      <Breadcrumb
        items={[
          { label: "쇼핑몰", href: "/shop" },
          { label: "기획전", href: "/shop/events" },
          { label: event.ev_subject },
        ]}
      />

      <h1
        className={
          "mb-6 text-2xl " + (event.ev_subject_strong ? "font-extrabold" : "font-bold")
        }
      >
        {event.ev_subject}
      </h1>

      <div className="mb-5 flex justify-end">
        <select
          value={selectedSortValue(sort, sortodr)}
          onChange={(e) => updateSort(e.target.value)}
          className="h-10 rounded-[4px] border bg-background px-3 text-sm outline-none"
          aria-label="상품 정렬"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value || "default"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {event.ev_head_image_url && (
        <div className="mb-6 overflow-hidden rounded-lg border bg-muted">
          <img
            src={event.ev_head_image_url}
            alt={event.ev_subject}
            className="h-auto w-full object-contain"
            loading="lazy"
          />
        </div>
      )}

      {event.ev_head_html && (
        <SafeHtml
          className="prose prose-sm mb-6 max-w-none"
          html={event.ev_head_html}
          policy="commerce"
        />
      )}

      {event.products.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          이 기획전에 등록된 상품이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {event.products.map((p) => {
            const isTelInquiry = String(p.it_tel_inq ?? "0") === "1";
            const hasDiscount = !isTelInquiry && p.it_cust_price > 0 && p.it_cust_price > p.it_price;

            return (
            <a
              key={p.it_id}
              href={shopProductHref(p, productRewriteMode)}
              className="group block"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt={p.it_name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 25vw"
                    unoptimized={shouldBypassImageOptimization(p.image_url)}
                  />
                ) : (
                  <ProductImageFallback compact />
                )}
                {p.it_soldout === "1" && (
                  <span className="absolute right-2 top-2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    품절
                  </span>
                )}
              </div>
              <div className="mt-2">
                <p className="line-clamp-2 text-sm font-medium">{p.it_name}</p>
                <p className="mt-1 text-sm font-bold text-primary">
                  {isTelInquiry ? "전화문의" : formatPrice(p.it_price)}
                </p>
                {hasDiscount && (
                  <p className="text-xs text-muted-foreground line-through">
                    {formatPrice(p.it_cust_price)}
                  </p>
                )}
              </div>
            </a>
            );
          })}
        </div>
      )}

      {event.ev_tail_html && (
        <SafeHtml
          className="prose prose-sm mt-8 max-w-none"
          html={event.ev_tail_html}
          policy="commerce"
        />
      )}

      {event.ev_tail_image_url && (
        <div className="mt-8 overflow-hidden rounded-lg border bg-muted">
          <img
            src={event.ev_tail_image_url}
            alt={event.ev_subject}
            className="h-auto w-full object-contain"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
