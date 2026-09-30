import { buildPageMetadata } from "@/lib/seo";
import ComparePage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "상품 비교",
  description: "선택한 상품의 가격, 카테고리, 재고 정보를 비교하세요.",
  path: "/shop/compare",
  noindex: true,
});

export default function Page() {
  return <ComparePage />;
}
