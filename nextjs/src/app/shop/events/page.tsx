import { buildPageMetadata } from "@/lib/seo";
import EventsListPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "기획전",
  description: "진행 중인 쇼핑몰 기획전과 이벤트 상품을 확인하세요.",
  path: "/shop/events",
});

export default function Page() {
  return <EventsListPage />;
}
