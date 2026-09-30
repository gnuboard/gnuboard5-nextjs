// @g5-static-fallback
import type { Metadata } from "next";
import ClientPage from "@/app/mypage/qas/[qa_id]/ClientPage";

export const dynamicParams = true;
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "1:1 문의 상세",
  description: "1:1 문의 내용을 확인하세요.",
  robots: {
    index: false,
    follow: false,
  },
};

export async function generateStaticParams() {
  return [{ qa_id: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ qa_id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { qa_id } = await params;

  return (
    <ClientPage
      qaId={qa_id}
      listHref="/shop/qas"
      loginHref="/shop/login?redirect=%2Fshop%2Fqas"
      newHref="/shop/qas/new"
      routePattern="/shop/qas/my/:qa_id"
    />
  );
}
