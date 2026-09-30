import { Skeleton } from "@/components/ui/skeleton";

export default function PasswordLoading() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-6">
      <Skeleton className="h-7 w-36" />
      <div className="space-y-4 max-w-md">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </div>
  );
}
