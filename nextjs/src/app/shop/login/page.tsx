import type { Metadata } from "next";
import AuthLayout from "../../(auth)/layout";
import LoginPage from "../../(auth)/login/page";

export const metadata: Metadata = {
  title: "쇼핑몰 로그인",
  description: "쇼핑몰 이용을 위해 로그인하세요",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ShopLoginPage() {
  return (
    <AuthLayout>
      <LoginPage />
    </AuthLayout>
  );
}
