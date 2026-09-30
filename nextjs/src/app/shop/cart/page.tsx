import { buildPageMetadata } from "@/lib/seo";
import CartPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "장바구니",
  description: "장바구니에 담긴 상품과 적용 가능한 쿠폰을 확인하세요.",
  path: "/shop/cart",
  noindex: true,
});

export default function Page() {
  return <CartPage />;
}
