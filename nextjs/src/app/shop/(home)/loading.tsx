import { Skeleton } from "@/components/ui/skeleton";
import { themeComponents } from "@/lib/theme";

export default function ShopLoading() {
  const ThemeShopHomePageLoading = themeComponents.ShopHomePageLoading;
  if (ThemeShopHomePageLoading) return <ThemeShopHomePageLoading />;

  return (
    <div>
      <Skeleton className="h-4 w-16 mb-4 mt-4" />

      {/* Banner */}
      <Skeleton className="mb-8 h-40 w-full rounded-xl sm:h-52" />

      {/* Product Sections */}
      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s} className="py-8">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
