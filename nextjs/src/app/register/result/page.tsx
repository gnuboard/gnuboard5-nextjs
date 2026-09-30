import type { Metadata } from "next";
import RegisterResultPage from "./ClientPage";

export const metadata: Metadata = {
  title: "회원가입 완료",
  description: "회원가입 완료 정보를 확인합니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return <RegisterResultPage />;
}
