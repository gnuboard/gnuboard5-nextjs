import type { Metadata } from "next";
import { redirect } from "next/navigation";
import RegisterPage from "./ClientPage";
import { usesServerRuntime } from "@/lib/next-runtime";
import {
  shopServiceContextPath,
  type RouteSearchParams,
} from "@/lib/server-route-context";

export const metadata: Metadata = {
  title: "회원가입",
  description: "회원으로 가입하고 커뮤니티와 쇼핑몰 서비스를 이용하세요.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<RouteSearchParams>;
}) {
  if (usesServerRuntime()) {
    const destination = shopServiceContextPath(
      await (searchParams ?? Promise.resolve({})),
      "/shop/register"
    );
    if (destination) redirect(destination);
  }

  return <RegisterPage />;
}
