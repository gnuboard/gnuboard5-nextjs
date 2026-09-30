// @g5-static-shell
import ClientPage from "./ClientPage";
import { redirect } from "next/navigation";
import { usesServerRuntime } from "@/lib/next-runtime";
import {
  shopServiceContextPath,
  type RouteSearchParams,
} from "@/lib/server-route-context";

export const dynamicParams = true;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return [{ qa_id: "__g5_static__" }];
}

interface PageProps {
  params: Promise<{ qa_id: string }>;
  searchParams: Promise<RouteSearchParams>;
}

export default async function Page({ params, searchParams }: PageProps) {
  const { qa_id } = await params;
  if (usesServerRuntime()) {
    const destination = shopServiceContextPath(
      await searchParams,
      `/shop/qas/my/${encodeURIComponent(qa_id)}`
    );
    if (destination) redirect(destination);
  }

  return <ClientPage qaId={qa_id} />;
}
