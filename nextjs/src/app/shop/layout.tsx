import { getCachedShopCategories } from "@/services/shop-categories";
import { CategoryNav } from "./CategoryNav";
import { themeComponents, themeConfig } from "@/lib/theme";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ThemeShopLayoutShell = themeComponents.ShopLayoutShell;
  const categories = await getCachedShopCategories();

  if (ThemeShopLayoutShell) {
    return <ThemeShopLayoutShell config={themeConfig} shopCategories={categories}>{children}</ThemeShopLayoutShell>;
  }

  return (
    <div className="naver-shell min-h-screen">
      <CategoryNav categories={categories} />
      <main className="site-container px-4 pb-16 pt-4">{children}</main>
    </div>
  );
}
