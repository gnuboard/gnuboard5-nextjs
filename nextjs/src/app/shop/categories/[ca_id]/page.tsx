// @g5-static-fallback
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getShopCategoryProductPage } from "@/services/shop";
import ClientPage from "./ClientPage";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ ca_id: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ ca_id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ca_id } = await params;
  const isStaticFallbackShell = ca_id === "__g5_static__";
  const page =
    isStaticFallbackShell
      ? null
      : await getShopCategoryProductPage(ca_id, { page: 1, per_page: 1 }).catch(
          () => null
        );
  const categoryName = page?.category?.ca_name;

  return buildPageMetadata({
    title: categoryName ? `${categoryName} 상품` : "상품 분류",
    description: categoryName
      ? `${categoryName} 카테고리 상품을 확인하세요.`
      : "쇼핑몰 상품 분류를 확인하세요.",
    path:
      isStaticFallbackShell
        ? "/shop"
        : `/shop/categories/${encodeURIComponent(ca_id)}`,
    noindex: isStaticFallbackShell || !categoryName,
  });
}

export default function Page(_props: PageProps) {
  return <ClientPage />;
}
