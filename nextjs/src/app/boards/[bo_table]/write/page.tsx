// @g5-static-fallback
import ClientPage from "./ClientPage";
import { buildPageMetadata } from "@/lib/seo";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ bo_table: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ bo_table: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { bo_table } = await params;

  return buildPageMetadata({
    title: "글쓰기",
    description: "게시판에 새 글을 작성하세요.",
    path:
      bo_table === "__g5_static__"
        ? "/boards"
        : `/boards/${encodeURIComponent(bo_table)}/write`,
    noindex: true,
  });
}

export default async function Page({ params }: PageProps) {
  const { bo_table } = await params;

  return <ClientPage boTable={bo_table} />;
}
