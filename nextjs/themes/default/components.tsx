import type { G5ThemeComponentSlots } from "@/lib/theme-types";
import { SoluneLayoutShell } from "./layout-shell";
import { SoluneHomePage } from "./home";
import { SoluneHomePageLoading } from "./home-loading";
import { SoluneShopHomePage } from "./shop-home";
import { SoluneShopHomePageLoading } from "./shop-home-loading";
import { SoluneShopLayoutShell } from "./shop-shell";
import { SoluneProductCard } from "./product-card";
import { SoluneBoardViewHeader } from "./board-view-header";
import { SoluneShopListHeader } from "./shop-list-header";
import { SoluneProductDetailTabs } from "./product-detail-tabs";
import { SoluneBoardListRow } from "./board-list-row";

// The community shell covers every route except /shop, where it steps aside
// and the shop shell draws the reference's own chrome (Ondam palette, fixed
// header with category panel, shop footer). Both share the service switch.
export const themeComponents = {
  LayoutShell: SoluneLayoutShell,
  ShopLayoutShell: SoluneShopLayoutShell,
  HomePage: SoluneHomePage,
  HomePageLoading: SoluneHomePageLoading,
  CommunityPage: SoluneHomePage,
  ShopHomePage: SoluneShopHomePage,
  ShopHomePageLoading: SoluneShopHomePageLoading,
  // 프레젠테이션 슬롯 — 앱이 데이터/동작을 갖고 테마는 그리기만 한다.
  ProductCard: SoluneProductCard,
  BoardViewHeader: SoluneBoardViewHeader,
  ShopListHeader: SoluneShopListHeader,
  ProductDetailTabs: SoluneProductDetailTabs,
  BoardListRow: SoluneBoardListRow,
} satisfies G5ThemeComponentSlots;
