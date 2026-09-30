import { buildPageMetadata } from "@/lib/seo";
import CouponZonePage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "쿠폰존",
  description: "다운로드 가능한 쇼핑몰 쿠폰을 확인하세요.",
  path: "/shop/couponzone",
});

export default function Page() {
  return <CouponZonePage />;
}
