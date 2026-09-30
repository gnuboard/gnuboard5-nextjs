import { buildPageMetadata } from "@/lib/seo";
import ShopProductsPage from "../products/ClientPage";

export const metadata = buildPageMetadata({
  title: "상품 검색",
  description: "쇼핑몰 상품을 검색하고 조건별로 찾아보세요.",
  path: "/shop/search",
  noindex: true,
});

export default function Page() {
  return <ShopProductsPage />;
}
