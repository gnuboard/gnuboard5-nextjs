import type { Metadata } from "next";
import { RedirectIfAuthenticated } from "../(auth)/redirect-if-authenticated";
import ForgotPasswordPage from "./ClientPage";

export const metadata: Metadata = {
  title: "회원정보 찾기",
  description: "가입할 때 등록한 이메일로 비밀번호를 다시 정합니다.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * 그누보드 bbs/password_lost.php 와 같은 "회원정보 찾기" 화면. 로그인 · 회원가입처럼 가운데 좁은 카드((auth) 레이아웃)가
 * 아니라, 다른 안쪽 화면처럼 경로 표시 · 제목 · 오른쪽 사이드바와 함께 그린다. 로그인한 채 열면 원래대로 돌려보낸다.
 */
export default function Page() {
  return (
    <RedirectIfAuthenticated>
      <ForgotPasswordPage />
    </RedirectIfAuthenticated>
  );
}
