import type { Metadata } from "next";
import AuthLayout from "../../(auth)/layout";
import RegisterPage from "../../(auth)/register/page";

export const metadata: Metadata = {
  title: "쇼핑몰 회원가입",
  description: "쇼핑몰 이용을 위한 회원가입 페이지입니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ShopRegisterPage() {
  return (
    <AuthLayout>
      <RegisterPage />
    </AuthLayout>
  );
}
