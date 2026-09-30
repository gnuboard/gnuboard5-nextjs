import { buildPageMetadata } from "@/lib/seo";
import PaymentFailPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "결제 실패",
  description: "결제 실패 사유를 확인하고 주문 페이지로 돌아갑니다.",
  path: "/shop/payment/fail",
  noindex: true,
});

export default function Page() {
  return <PaymentFailPage />;
}
