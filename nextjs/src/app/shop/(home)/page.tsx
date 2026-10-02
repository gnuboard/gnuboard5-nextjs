import { G5Link as Link } from "@/components/ui/g5-link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { buildPageMetadata } from "@/lib/seo";
import { themeComponents, themeConfig } from "@/lib/theme";
import { buildShopHomeData } from "@/lib/shop-home";
import { getShopBanners, getShopPopups } from "@/services/shop";
import { DeferredShopSections } from "../DeferredShopSections";
import { ShopHomeBanners } from "../ShopHomeBanners";
import { ShopHomePopupsLazy as ShopHomePopups } from "../ShopHomePopupsLazy";
import { ShopHomePopular } from "../ShopHomePopular";

export const metadata = buildPageMetadata({
  title: "쇼핑몰",
  description: "인기 상품, 새 상품, 추천 상품을 한 화면에서 빠르게 확인하세요.",
  path: "/shop",
});

async function DefaultShopHomePage() {
  const [banners, popups] = await Promise.all([
    getShopBanners({ position: "메인", device: "all" }),
    getShopPopups({ device: "all", limit: 5 }),
  ]);

  return (
    <div>
      <Breadcrumb items={[{ label: "쇼핑몰" }]} />

      <section className="page-hero mb-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="section-eyebrow">그누보드 영카트</p>
            <h1 className="page-hero-title">쇼핑몰</h1>
            <p className="page-hero-desc">
              인기 상품, 새 상품, 추천 상품과 고객 후기를 한 화면에서 빠르게 확인하세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/shop/products" className="filter-chip filter-chip-active">
              전체 상품
            </Link>
            <Link href="/shop/reviews" className="filter-chip">
              사용후기
            </Link>
            <Link href="/shop/qas" className="filter-chip">
              상품문의
            </Link>
            <Link href="/shop/events" className="filter-chip">
              기획전
            </Link>
            <Link href="/shop/couponzone" className="filter-chip">
              쿠폰존
            </Link>
          </div>
        </div>
      </section>

      <ShopHomeBanners banners={banners} />

      <ShopHomePopular />
      <DeferredShopSections />
      <ShopHomePopups popups={popups} />
    </div>
  );
}

export default async function ShopHomePage() {
  const ThemeShopHomePage = themeComponents.ShopHomePage;
  if (ThemeShopHomePage) {
    const shopHome = await buildShopHomeData();

    return <ThemeShopHomePage config={themeConfig} shopProducts={shopHome.featuredProducts} shopHome={shopHome} />;
  }

  return <DefaultShopHomePage />;
}
