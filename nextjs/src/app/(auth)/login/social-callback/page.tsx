import type { Metadata } from "next";
import SocialCallbackPage from "./ClientPage";

export const metadata: Metadata = {
  title: "소셜 로그인 처리",
  description: "소셜 로그인 인증 결과를 처리합니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return <SocialCallbackPage />;
}
