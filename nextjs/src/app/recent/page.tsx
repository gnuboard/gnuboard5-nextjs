import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import ClientPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "새글",
  path: "/recent",
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
