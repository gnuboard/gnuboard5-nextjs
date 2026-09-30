import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import ClientPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "설문조사",
  path: "/polls",
});

function PageFallback() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div role="status" aria-label="설문조사 로딩 중" className="space-y-4 rounded-lg border p-6">
        <span className="sr-only">설문조사 로딩 중</span>
        <div aria-hidden="true" className="skeleton h-6 w-2/3 rounded" />
        <div aria-hidden="true" className="skeleton h-4 w-1/2 rounded" />
        <div aria-hidden="true" className="space-y-3">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-12 rounded-md" />)}
        </div>
      </div>
    </div>
  );
}

export default function PollsPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ClientPage />
    </Suspense>
  );
}
