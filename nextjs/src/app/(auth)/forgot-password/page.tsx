import type { Metadata } from "next";
import ForgotPasswordPage from "./ClientPage";

export const metadata: Metadata = {
  title: "비밀번호 찾기",
  description: "가입한 계정의 비밀번호를 재설정하세요.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return <ForgotPasswordPage />;
}
