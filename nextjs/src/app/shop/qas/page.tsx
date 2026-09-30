import { buildPageMetadata } from "@/lib/seo";
import ShopQasPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "상품문의",
  description: "쇼핑몰 상품문의와 답변 상태를 확인하세요.",
  path: "/shop/qas",
});

export default function Page() {
  return <ShopQasPage />;
}
