// @g5-static-fallback
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BreadcrumbJsonLd, ProductJsonLd } from "@/components/seo/JsonLd";
import { usesServerRuntime } from "@/lib/next-runtime";
import { buildPageMetadata, plainTextSummary } from "@/lib/seo";
import type { ShopProduct } from "@/lib/shop-types";
import { getShopProductBySeoResult, getShopProductResult, getShopProducts } from "@/services/shop";
import ProductDetailClient from "./ProductDetailClient";
import ProductDetailSkeleton from "./ProductDetailSkeleton";
import { STATIC_PRODUCT_FALLBACK_SEGMENT, isStaticProductFallbackSegment } from "./static-fallback";

export const dynamicParams = true;
export const dynamic = "force-static";

function positiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function staticSegment(value: string | null | undefined): string {
  const segment = String(value || "").trim();
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\")
  ) {
    return "";
  }
  return segment;
}

export async function generateStaticParams() {
  const params = [
    { it_id: "__g5_static__" },
    { it_id: STATIC_PRODUCT_FALLBACK_SEGMENT },
  ];
  const seen = new Set(params.map((item) => item.it_id));
  const limit = positiveIntEnv("G5_STATIC_PRODUCT_PARAM_LIMIT", 1000);

  try {
    const products = await getShopProducts({ per_page: limit }, 3600);

    for (const product of products) {
      for (const segment of [
        staticSegment(product.it_id),
        staticSegment(product.it_seo_title),
      ]) {
        if (!segment || seen.has(segment)) continue;
        seen.add(segment);
        params.push({ it_id: segment });
      }
    }
  } catch {
    // Keep the placeholder route for static installs when the API is unavailable at build time.
  }

  return params;
}

interface PageProps {
  params: Promise<{ it_id: string }>;
}

interface ProductLookup {
  product: ShopProduct | null;
  /** 상품 번호로도, SEO 주소로도 "없는 상품"(404)이었다. */
  missing: boolean;
}

async function lookupProductForPage(itId: string): Promise<ProductLookup> {
  if (isStaticProductFallbackSegment(itId)) return { product: null, missing: false };

  const byId = await getShopProductResult(itId).catch(() => null);
  if (byId?.ok) return { product: byId.data, missing: false };

  const bySeo = await getShopProductBySeoResult(itId).catch(() => null);
  if (bySeo?.ok) return { product: bySeo.data, missing: false };

  return { product: null, missing: byId?.status === 404 && bySeo?.status === 404 };
}

/** 서버 실행(Vercel)에서는 없는 상품을 404 로 응답한다 — 글 상세 페이지와 같은 이유로 위에 loading.tsx 를 두지 않는다. */
function notFoundOnServerRuntime(lookup: ProductLookup): void {
  if (lookup.missing && usesServerRuntime()) notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { it_id } = await params;
  const isStaticFallbackShell = isStaticProductFallbackSegment(it_id);
  const lookup = await lookupProductForPage(it_id);
  notFoundOnServerRuntime(lookup);
  const product = lookup.product;

  return buildPageMetadata({
    title: product?.it_name || "상품 상세",
    description: product?.it_basic || plainTextSummary(product?.it_explan, product?.it_name),
    path: product?.it_id
      ? `/shop/${encodeURIComponent(product.it_id)}`
      : isStaticFallbackShell
        ? "/shop/products"
        : `/shop/${encodeURIComponent(it_id)}`,
    image: product?.image_url || product?.images?.[0],
    noindex: !product,
  });
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { it_id } = await params;
  // 셸 세그먼트(__g5_static__ / g5-static-product)여도 클라이언트를 그대로 띄운다 — 정적
  // 설치본에서는 모든 /shop/<id> 가 이 셸로 오고, 실제 id 는 브라우저에서 URL 로 알아낸다.
  const lookup = await lookupProductForPage(it_id);
  notFoundOnServerRuntime(lookup);
  const initialProduct = lookup.product;

  const breadcrumbItems = initialProduct
    ? [
        { name: "Shop", url: "/shop" },
        ...(initialProduct.ca_id && initialProduct.ca_name
          ? [
              {
                name: initialProduct.ca_name,
                url: `/shop/categories/${encodeURIComponent(initialProduct.ca_id)}`,
              },
            ]
          : []),
        {
          name: initialProduct.it_name,
          url: `/shop/${encodeURIComponent(initialProduct.it_id)}`,
        },
      ]
    : [];

  return (
    <>
      {initialProduct ? (
        <>
          <ProductJsonLd product={initialProduct} />
          <BreadcrumbJsonLd items={breadcrumbItems} />
        </>
      ) : null}
      {/* loading.tsx 대신 여기서 감싼다 — 위의 notFound() 가 응답 전에 돌아야 404 가 붙는다. */}
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailClient
          itId={it_id}
          initialProduct={initialProduct}
          isStaticFallbackShell={isStaticProductFallbackSegment(it_id)}
        />
      </Suspense>
    </>
  );
}
