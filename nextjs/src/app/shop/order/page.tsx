import { buildPageMetadata } from "@/lib/seo";
import OrderPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "주문/결제",
  description: "주문 상품, 배송지, 결제수단을 확인하고 결제를 진행하세요.",
  path: "/shop/order",
  noindex: true,
});

export default function Page() {
  return <OrderPage />;
}
