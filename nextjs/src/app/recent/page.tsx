import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import ClientPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "새글",
  path: "/recent",
  // 글 하나하나는 사이트맵으로 색인된다. 새글은 그 글들을 모은 목록이고, 작성자 필터(?mb_id=)는 주소에 아이디가 남으므로 색인하지 않는다.
  noindex: true,
});

function PageFallback() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div role="status" aria-label="새글 로딩 중" className="space-y-4">
        <span className="sr-only">새글 로딩 중</span>
        <div aria-hidden="true" className="skeleton h-9 w-48 rounded" />
        <div aria-hidden="true" className="skeleton h-10 w-full rounded-md" />
        <div aria-hidden="true" className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="skeleton h-12 rounded-md" />)}
        </div>
      </div>
    </div>
  );
}

export default function RecentPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ClientPage />
    </Suspense>
  );
}
