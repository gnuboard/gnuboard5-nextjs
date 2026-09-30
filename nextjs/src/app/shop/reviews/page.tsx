import { buildPageMetadata } from "@/lib/seo";
import ShopReviewsPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "사용후기",
  description: "쇼핑몰 상품 사용후기를 한곳에서 확인하세요.",
  path: "/shop/reviews",
});

export default function Page() {
  return <ShopReviewsPage />;
}
