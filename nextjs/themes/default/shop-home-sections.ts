import type { G5ThemeShopHomeData } from "@/lib/theme-types";

export type SoluneShopHomeSection = {
  key: keyof Omit<G5ThemeShopHomeData, "reviews" | "featuredProducts">;
  eyebrow: string;
  title: string;
  sub?: string;
  type: number;
  peek: boolean;
};

/* The type values are Gnuboard product flags: 1 hit, 2 recommended, 3 latest,
   4 popular, and 5 sale. Keep this shared by the live rows and their fallback. */
export const SOLUNE_SHOP_HOME_SECTIONS: SoluneShopHomeSection[] = [
  { key: "bestProducts", eyebrow: "HIT", title: "히트상품", sub: "가장 많이 나간 상품입니다.", type: 1, peek: true },
  { key: "latestProducts", eyebrow: "NEW ARRIVAL", title: "최신상품", sub: "가장 최근에 등록된 상품입니다.", type: 3, peek: true },
  { key: "recommendedProducts", eyebrow: "MD PICK", title: "추천상품", sub: "오래 쓰이는 것으로 골랐습니다.", type: 2, peek: true },
  { key: "saleProducts", eyebrow: "SALE", title: "할인상품", sub: "지금 값을 내린 상품입니다.", type: 5, peek: true },
  { key: "popularProducts", eyebrow: "POPULAR", title: "많이 보고 계신 상품", type: 4, peek: false },
];
