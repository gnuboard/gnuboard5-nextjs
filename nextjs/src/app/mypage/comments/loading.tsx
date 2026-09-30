import { Skeleton } from "@/components/ui/skeleton";

export default function MyCommentsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-24" />
      <div className="rounded-lg border bg-card">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b last:border-b-0 space-y-1">
            <Skeleton className="h-4 w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
