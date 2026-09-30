import type { Metadata } from "next";
import ClientPage from "@/app/mypage/qas/new/ClientPage";

export const metadata: Metadata = {
  title: "쇼핑몰 1:1 문의",
  description: "쇼핑몰 이용 관련 문의를 남기세요.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return (
    <ClientPage
      detailBaseHref="/shop/qas/my"
      listHref="/shop/qas"
      loginHref="/shop/login?redirect=%2Fshop%2Fqas%2Fnew"
      newHref="/shop/qas/new"
      title="쇼핑몰 1:1 문의하기"
    />
  );
}
