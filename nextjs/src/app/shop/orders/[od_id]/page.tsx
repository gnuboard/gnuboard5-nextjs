// @g5-static-fallback
import ClientPage from "./ClientPage";
import { buildPageMetadata } from "@/lib/seo";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ od_id: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ od_id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { od_id } = await params;

  return buildPageMetadata({
    title: "주문 상세",
    description: "주문 상세와 배송 상태를 확인하세요.",
    path:
      od_id === "__g5_static__"
        ? "/shop/orders"
        : `/shop/orders/${encodeURIComponent(od_id)}`,
    noindex: true,
  });
}

export default function Page(_props: PageProps) {
  return <ClientPage />;
}
