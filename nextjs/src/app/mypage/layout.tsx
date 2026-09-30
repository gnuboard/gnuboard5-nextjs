import type { Metadata } from "next";
import MyPageClientLayout from "./ClientLayout";

export const metadata: Metadata = {
  title: "마이페이지",
  description: "회원 정보, 주문, 포인트, 쿠폰, 활동 내역을 확인하세요.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function MyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MyPageClientLayout>{children}</MyPageClientLayout>;
}
