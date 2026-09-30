import { Skeleton } from "@/components/ui/skeleton";

function FeedSkeleton() {
  return (
    <div className="home-panel overflow-hidden">
      <div className="section-header">
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-5 w-20" />
        </div>
        <Skeleton className="h-8 w-16 rounded-[4px]" />
      </div>
      <div className="p-4">
        <Skeleton className="aspect-[16/10] w-full rounded-[8px]" />
        <Skeleton className="mt-4 h-6 w-3/4" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
      <div className="grid border-t md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex min-h-[92px] items-center gap-3 border-t p-4 md:first:border-t-0 md:even:border-l">
            <Skeleton className="size-14 rounded-[6px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="board-preview-card overflow-hidden">
      <div className="section-header">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-16 rounded-[4px]" />
      </div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex min-h-[58px] items-center gap-3 border-t px-4 py-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function HomeLoading() {
  return (
    <div className="naver-shell pb-12">
      <section className="site-container px-4 pt-6">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-8 w-[320px] max-w-full" />
          </div>
          <div className="grid grid-cols-3 gap-2 md:w-[360px]">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-[8px]" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <FeedSkeleton />
          <div className="home-panel overflow-hidden">
            <div className="section-header">
              <div>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-16" />
              </div>
              <Skeleton className="h-8 w-16 rounded-[4px]" />
            </div>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex min-h-[58px] items-center gap-3 border-t px-4 py-3">
                <Skeleton className="size-2 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-container px-4 pt-5">
        <Skeleton className="h-20 rounded-[8px]" />
      </section>

      <section className="site-container px-4 pt-5">
        <Skeleton className="mb-3 h-6 w-36" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <BoardSkeleton key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
