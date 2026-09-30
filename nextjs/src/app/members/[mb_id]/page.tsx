// @g5-static-shell
import ClientPage from "./ClientPage";
import { buildPageMetadata } from "@/lib/seo";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ mb_id: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ mb_id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { mb_id } = await params;

  return buildPageMetadata({
    title: "회원 프로필",
    description: "회원 공개 프로필을 확인하세요.",
    path:
      mb_id === "__g5_static__"
        ? "/members"
        : `/members/${encodeURIComponent(mb_id)}`,
    noindex: true,
  });
}

export default async function Page({ params }: PageProps) {
  const { mb_id } = await params;

  return <ClientPage mbId={mb_id} />;
}
