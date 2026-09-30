import { Suspense } from "react";
import { buildPageMetadata } from "@/lib/seo";
import ClientPage from "./ClientPage";

export const metadata = buildPageMetadata({
  title: "FAQ",
  path: "/faq",
});

function PageFallback() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div role="status" aria-label="FAQ 로딩 중" className="space-y-4">
        <span className="sr-only">FAQ 로딩 중</span>
        <div aria-hidden="true" className="skeleton h-9 w-40 rounded" />
        <div aria-hidden="true" className="skeleton h-11 w-full rounded-md" />
        <div aria-hidden="true" className="space-y-3">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-16 rounded-md" />)}
        </div>
      </div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ClientPage />
    </Suspense>
  );
}
