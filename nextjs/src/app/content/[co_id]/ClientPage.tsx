"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SafeHtml } from "@/components/SafeHtml";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { StaticFallbackNotice } from "@/components/StaticFallbackNotice";
import { g5PathForRuntime } from "@/lib/config";
import { applyClientPageMetadata } from "@/lib/client-metadata";
import { useRuntimeRouteParam, useRuntimeRouteReady } from "@/hooks/use-runtime-route-param";
import { getClientContent, getClientContentBySeo } from "@/services/content";
import type { ContentData } from "@/lib/schemas";

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface ContentPageProps {
  coId?: string;
  initialContent?: ContentData | null;
  pathPrefix?: string;
  routePattern?: string;
  surface?: "community" | "shop";
}

export default function ContentPage({
  coId,
  initialContent = null,
  pathPrefix = "/content",
  routePattern = "/content/:co_id",
  surface,
}: ContentPageProps) {
  const co_id = useRuntimeRouteParam("co_id", routePattern, coId);
  const routeReady = useRuntimeRouteReady();
  const normalizedPathPrefix = pathPrefix.replace(/\/+$/, "") || "/content";
  const isShopSurface = surface === "shop" || normalizedPathPrefix === "/shop/content";
  const isStaticFallbackShell = coId === "__g5_static__";
  const isLegacySeoPath =
    typeof window !== "undefined" &&
    window.location.pathname !== "/" &&
    window.location.pathname.endsWith("/") &&
    window.location.pathname.startsWith(`${normalizedPathPrefix}/`);
  const [content, setContent] = useState<ContentData | null>(initialContent);
  const [loading, setLoading] = useState(!initialContent);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialContent && co_id === coId) {
      setContent(initialContent);
      setError(null);
      setLoading(false);
      return;
    }

    if (!co_id) {
      // 하이드레이션 첫 렌더는 주소를 아직 못 읽어 id 가 비어 있다 — 로딩을 유지한다.
      if (!routeReady) return;
      setContent(null);
      setError("컨텐츠를 찾을 수 없습니다.");
      setLoading(false);
      return;
    }

    async function fetchContent() {
      try {
        setLoading(true);
        setError(null);
        if (isLegacySeoPath) {
          const data = await getClientContentBySeo(decodeRouteSegment(co_id));
          if (data?.co_id) {
            window.location.replace(g5PathForRuntime(`${normalizedPathPrefix}/${data.co_id}`));
            return;
          }

          setContent(null);
          setError("컨텐츠를 찾을 수 없습니다.");
          return;
        }

        const data = await getClientContent(co_id);
        if (data) {
          setContent(data);
        } else {
          setError("컨텐츠를 찾을 수 없습니다.");
        }
      } catch {
        setError("컨텐츠를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [co_id, coId, initialContent, isLegacySeoPath, normalizedPathPrefix, routeReady]);

  useEffect(() => {
    if (!content) return;

    applyClientPageMetadata({
      title: content.co_subject,
      description: content.co_content,
      path: `${normalizedPathPrefix}/${content.co_id}`,
    });
  }, [content, normalizedPathPrefix]);

  if (loading) {
    if (isShopSurface) {
      return (
        <section className="shop-content-page">
          <div className="shop-content-shell mx-auto w-full max-w-6xl px-4 py-12">
            <div className="shop-content-card rounded-lg border bg-card p-6 md:p-8">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton mt-5 h-9 w-72 max-w-full rounded" />
              <div className="mt-8 space-y-3">
                <div className="skeleton h-4 rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-4 w-2/3 rounded" />
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <div className="space-y-4">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
        </div>
      </div>
    );
  }

  if (error || !content) {
    if (isShopSurface) {
      return (
        <section className="shop-content-page">
          <div className="shop-content-shell mx-auto w-full max-w-6xl px-4 py-12">
            <div className="shop-content-card rounded-lg border bg-card p-6 text-center md:p-8">
              <p className="text-xs font-black tracking-[0.28em] text-primary">GUIDE</p>
              <h1 className="mt-4 text-2xl font-black text-foreground">안내 페이지를 찾을 수 없습니다.</h1>
              <p className="mt-3 text-sm text-muted-foreground">{error || "컨텐츠를 찾을 수 없습니다."}</p>
              {isStaticFallbackShell ? <StaticFallbackNotice kind="content" /> : null}
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                <Link href="/shop" className="shop-content-button inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
                  쇼핑몰 홈
                </Link>
                <Link href="/shop/qas/new" className="shop-content-button shop-content-button-muted inline-flex items-center rounded-md border px-4 py-2 text-sm font-bold hover:bg-muted">
                  1:1 문의
                </Link>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <div className="container mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive">{error || "컨텐츠를 찾을 수 없습니다."}</p>
          {isStaticFallbackShell ? <StaticFallbackNotice kind="content" /> : null}
        </div>
      </div>
    );
  }

  if (isShopSurface) {
    return (
      <section className="shop-content-page">
        <div className="shop-content-shell mx-auto w-full max-w-6xl px-4 py-12">
          <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground" aria-label="쇼핑몰 콘텐츠 경로">
            <Link href="/shop" className="text-primary hover:underline">
              쇼핑몰
            </Link>
            <span aria-hidden="true">/</span>
            <span>안내</span>
            <span aria-hidden="true">/</span>
            <span className="text-foreground">{content.co_subject}</span>
          </nav>

          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="shop-content-side rounded-lg border bg-card p-5 lg:self-start">
              <p className="text-xs font-black tracking-[0.26em] text-primary">SHOP</p>
              <h2 className="mt-3 text-xl font-black text-foreground">쇼핑몰 안내</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                주문, 배송, 회원 정보와 관련된 쇼핑몰 정책을 확인할 수 있습니다.
              </p>
              <div className="mt-6 grid gap-2 text-sm font-bold">
                <Link href="/shop/content/company" className="shop-content-side-link rounded-md px-3 py-2 hover:bg-muted">
                  회사소개
                </Link>
                <Link href="/shop/content/provision" className="shop-content-side-link rounded-md px-3 py-2 hover:bg-muted">
                  이용약관
                </Link>
                <Link href="/shop/content/privacy" className="shop-content-side-link rounded-md px-3 py-2 hover:bg-muted">
                  개인정보처리방침
                </Link>
              </div>
            </aside>

            <article className="shop-content-card rounded-lg border bg-card p-6 md:p-8">
              <header className="border-b pb-6">
                <p className="text-xs font-black tracking-[0.28em] text-primary">GUIDE</p>
                <h1 className="mt-3 text-3xl font-black leading-tight text-foreground">{content.co_subject}</h1>
              </header>
              <SafeHtml
                className="shop-content-prose prose prose-sm mt-6 max-w-none"
                html={content.co_content}
                policy="commerce"
              />
            </article>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Breadcrumb items={[{ label: content.co_subject }]} />
      <article>
        <header className="mb-8 border-b pb-4">
          <h1 className="text-2xl font-bold">{content.co_subject}</h1>
        </header>
        <SafeHtml
          className="prose prose-sm dark:prose-invert max-w-none"
          html={content.co_content}
          policy="commerce"
        />
      </article>
    </div>
  );
}
