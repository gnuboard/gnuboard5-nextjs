import { Skeleton } from "@/components/ui/skeleton";

export default function CartLoading() {
  return (
    <div className="py-6">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-8 w-32 mb-6" />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Cart Items */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 rounded-lg border bg-card p-4">
              <Skeleton className="h-24 w-24 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-12 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
              <div className="text-right space-y-2">
                <Skeleton className="h-5 w-20 ml-auto" />
                <Skeleton className="h-8 w-8 ml-auto rounded-md" />
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="rounded-lg border bg-card p-6 h-fit space-y-4">
          <Skeleton className="h-6 w-24" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <div className="border-t pt-4 flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
