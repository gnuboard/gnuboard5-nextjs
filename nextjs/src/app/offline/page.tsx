import type { Metadata } from "next";
import OfflinePage from "./ClientPage";

export const metadata: Metadata = {
  title: "오프라인",
  description: "네트워크 연결이 끊겼을 때 표시되는 오프라인 안내 페이지입니다.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return <OfflinePage />;
}
