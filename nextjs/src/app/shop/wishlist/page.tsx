import { buildPageMetadata } from "@/lib/seo";
import WishlistPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "위시리스트",
  description: "찜한 상품을 확인하고 장바구니에 담아보세요.",
  path: "/shop/wishlist",
  noindex: true,
});

export default function Page() {
  return <WishlistPage />;
}
