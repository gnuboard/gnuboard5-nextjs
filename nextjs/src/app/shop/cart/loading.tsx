import { Skeleton } from "@/components/ui/skeleton";

/** 장바구니 표(ClientPage · CartTable)와 같은 자리 — 제목, 위가 짙은 표의 상품 줄, 합계 막대. */
export default function CartLoading() {
  return (
    <div className="py-6">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-8 w-32 mb-6" />

      <div className="border-t-2 border-foreground/80">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 border-b py-6">
            <Skeleton className="mt-1 h-[18px] w-[18px] shrink-0 rounded-sm" />
            <Skeleton className="h-20 w-20 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4 max-w-sm" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
            <Skeleton className="hidden h-5 w-24 md:block" />
          </div>
        ))}
      </div>

      <Skeleton className="mt-8 h-16 w-full rounded-md" />
      <div className="mx-auto mt-8 flex max-w-sm gap-2">
        <Skeleton className="h-12 flex-1 rounded-md" />
        <Skeleton className="h-12 flex-1 rounded-md" />
      </div>
    </div>
  );
}
