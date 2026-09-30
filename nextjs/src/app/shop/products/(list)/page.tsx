import { buildPageMetadata } from "@/lib/seo";
import { permanentRedirect } from "next/navigation";
import ShopProductsPage from "../ClientPage";
import { usesServerRuntime } from "@/lib/next-runtime";
import {
  legacyShopTypeRedirectPath,
  shopTypeCanonicalPath,
  type RouteSearchParams,
} from "@/lib/server-route-context";

const PRODUCTS_METADATA = {
  title: "상품 목록",
  description: "쇼핑몰의 전체 상품과 추천 상품을 확인하세요.",
  path: "/shop/products",
};

type PageProps = {
  searchParams: Promise<RouteSearchParams>;
};

export async function generateMetadata({ searchParams }: PageProps) {
  const path = usesServerRuntime()
    ? shopTypeCanonicalPath(await searchParams)
    : "/shop/products";
  return buildPageMetadata({ ...PRODUCTS_METADATA, path });
}

export default async function Page({ searchParams }: PageProps) {
  if (usesServerRuntime()) {
    const destination = legacyShopTypeRedirectPath(await searchParams);
    if (destination) permanentRedirect(destination);
  }

  return <ShopProductsPage />;
}
