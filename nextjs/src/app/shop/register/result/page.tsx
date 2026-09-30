import type { Metadata } from "next";
import RegisterResultPage from "@/app/register/result/ClientPage";

export const metadata: Metadata = {
  title: "쇼핑몰 회원가입 완료",
  description: "쇼핑몰 회원가입 완료 정보를 확인합니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return (
    <RegisterResultPage
      homeHref="/shop"
      homeLabel="쇼핑몰로"
      loginHref="/shop/login?redirect=%2Fshop"
      title="쇼핑몰 회원가입 완료"
    />
  );
}
