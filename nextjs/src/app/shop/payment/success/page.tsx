import { buildPageMetadata } from "@/lib/seo";
import PaymentSuccessPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "결제 승인 처리",
  description: "결제 승인 결과를 확인하고 주문 내역으로 이동합니다.",
  path: "/shop/payment/success",
  noindex: true,
});

export default function Page() {
  return <PaymentSuccessPage />;
}
