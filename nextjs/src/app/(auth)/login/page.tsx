import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginPageClient from "./LoginPageClient";
import { usesServerRuntime } from "@/lib/next-runtime";
import {
  shopLoginContextPath,
  type RouteSearchParams,
} from "@/lib/server-route-context";

export const metadata: Metadata = {
  title: "로그인",
  description: "계정에 로그인하세요",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<RouteSearchParams>;
}) {
  if (usesServerRuntime()) {
    const destination = shopLoginContextPath(await (searchParams ?? Promise.resolve({})));
    if (destination) redirect(destination);
  }

  return <LoginPageClient />;
}
