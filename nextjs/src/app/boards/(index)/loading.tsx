import { Skeleton } from "@/components/ui/skeleton";

export default function BoardsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Skeleton className="h-4 w-24 mb-4" />
      <Skeleton className="h-10 w-48 mb-8" />

      <div className="space-y-10">
        {Array.from({ length: 2 }).map((_, i) => (
          <section key={i}>
            <Skeleton className="h-7 w-32 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="rounded-lg border bg-card p-6">
                  <Skeleton className="h-6 w-32 mb-3" />
                  <div className="flex gap-3">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
