import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import ClientPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "검색",
  path: "/search",
  // 검색 결과 화면은 질의마다 내용이 바뀌는 얇은 페이지라 색인하지 않는다(사이트맵에도 넣지 않는다).
  noindex: true,
});

function PageFallback() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div role="status" aria-label="검색 결과 로딩 중" className="space-y-4">
        <span className="sr-only">검색 결과 로딩 중</span>
        <div aria-hidden="true" className="skeleton h-11 w-full rounded-md" />
        <div aria-hidden="true" className="space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="skeleton h-28 rounded-lg" />)}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ClientPage />
    </Suspense>
  );
}
