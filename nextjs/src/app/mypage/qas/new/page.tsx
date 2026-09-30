import ClientPage from "./ClientPage";
import { redirect } from "next/navigation";
import { usesServerRuntime } from "@/lib/next-runtime";
import {
  shopServiceContextPath,
  type RouteSearchParams,
} from "@/lib/server-route-context";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<RouteSearchParams>;
}) {
  if (usesServerRuntime()) {
    const destination = shopServiceContextPath(await searchParams, "/shop/qas/new");
    if (destination) redirect(destination);
  }

  return <ClientPage />;
}
