import { buildPageMetadata } from "@/lib/seo";
import PersonalPayListPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "개인결제",
  description: "운영자가 발급한 개인결제 목록을 확인하고 결제를 진행하세요.",
  path: "/shop/personalpay",
  noindex: true,
});

export default function Page() {
  return <PersonalPayListPage />;
}
