import type { G5ThemeComponentSlots } from "@/lib/theme-types";
import { HandbookServerLayoutShell, HandbookServerShopLayoutShell } from "./layout-shell.server";
import { HandbookHomePage } from "./home";
import { HandbookShopHomePage } from "./shop-home";
import { HandbookBoardViewHeader } from "./board-view-header";

export const themeComponents = {
  LayoutShell: HandbookServerLayoutShell,
  BoardViewHeader: HandbookBoardViewHeader,
  ShopLayoutShell: HandbookServerShopLayoutShell,
  HomePage: HandbookHomePage,
  CommunityPage: HandbookHomePage,
  ShopHomePage: HandbookShopHomePage,
  OrganicPage: HandbookShopHomePage,
} satisfies G5ThemeComponentSlots;
