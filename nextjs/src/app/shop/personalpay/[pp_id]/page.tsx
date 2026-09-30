// @g5-static-fallback
import ClientPage from "./ClientPage";
import { buildPageMetadata } from "@/lib/seo";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ pp_id: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ pp_id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { pp_id } = await params;

  return buildPageMetadata({
    title: "개인결제 상세",
    description: "개인결제 요청 내역을 확인하세요.",
    path:
      pp_id === "__g5_static__"
        ? "/shop/personalpay"
        : `/shop/personalpay/${encodeURIComponent(pp_id)}`,
    noindex: true,
  });
}

export default function Page(_props: PageProps) {
  return <ClientPage />;
}
