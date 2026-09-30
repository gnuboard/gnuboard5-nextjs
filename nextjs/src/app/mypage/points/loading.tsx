import { Skeleton } from "@/components/ui/skeleton";

export default function PointsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-28" />
      <div className="rounded-lg border bg-card p-4 mb-4">
        <Skeleton className="h-5 w-24 mb-1" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="rounded-lg border bg-card">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0">
            <div className="space-y-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
