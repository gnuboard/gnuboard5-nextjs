import { buildPageMetadata } from "@/lib/seo";
import OrdersPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "주문/배송조회",
  description: "회원 주문 내역과 비회원 주문 배송 상태를 확인하세요.",
  path: "/shop/orders",
  noindex: true,
});

export default function Page() {
  return <OrdersPage />;
}
