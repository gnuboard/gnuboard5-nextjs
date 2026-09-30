import { Skeleton } from "@/components/ui/skeleton";

export default function BoardPostListLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-20 rounded-md" />
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-20" />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left w-16">
                  <Skeleton className="h-4 w-8" />
                </th>
                <th className="px-4 py-3 text-left">
                  <Skeleton className="h-4 w-12" />
                </th>
                <th className="px-4 py-3 text-left w-24 hidden md:table-cell">
                  <Skeleton className="h-4 w-12" />
                </th>
                <th className="px-4 py-3 text-center w-28 hidden md:table-cell">
                  <Skeleton className="h-4 w-12 mx-auto" />
                </th>
                <th className="px-4 py-3 text-center w-16 hidden lg:table-cell">
                  <Skeleton className="h-4 w-8 mx-auto" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 15 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-8" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-full max-w-md" />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Skeleton className="h-4 w-20 mx-auto" />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <Skeleton className="h-4 w-10 mx-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex justify-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-9 rounded-md" />
        ))}
      </div>
    </div>
  );
}
