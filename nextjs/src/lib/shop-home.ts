import type { G5ThemeShopHomeData } from "@/lib/theme-types";
import { getShopProducts, getShopReviewsCached } from "@/services/shop";

/** 홈의 진열 한 줄에 싣는 상품 수. 레퍼런스 진열은 12장을 넘긴다. */
export const SHOP_HOME_ROW_LIMIT = 12;

/**
 * 쇼핑 홈이 쓰는 상품 묶음(대표·히트·추천·최신·할인·인기·후기).
 *
 * 서버(빌드·프리렌더)와 브라우저 양쪽에서 부른다. 휴대용 정적 빌드는 어느 사이트의
 * 상품도 굽지 않으므로, 테마 홈은 이 함수를 브라우저에서 한 번 더 불러 실제 내용을
 * 채운다. `runtime` 이면 캐시를 쓰지 않는다.
 *
 * `include` 를 주면 그 묶음만 받고 나머지는 빈 목록으로 둔다. 테마가 그리지 않는 진열을
 * 받지 않으려는 것이다(기본 테마는 대표 상품 줄이 없다). 주지 않으면 전부 받는다.
 */
export async function buildShopHomeData(
  options: { runtime?: boolean; include?: readonly (keyof G5ThemeShopHomeData)[] } = {}
): Promise<G5ThemeShopHomeData> {
  const revalidate = options.runtime === true ? 0 : 30;
  const perPage = SHOP_HOME_ROW_LIMIT;
  const wants = (key: keyof G5ThemeShopHomeData) => !options.include || options.include.includes(key);
  const products = (key: keyof G5ThemeShopHomeData, params: Record<string, string>) =>
    wants(key) ? getShopProducts({ ...params, per_page: perPage }, revalidate) : Promise.resolve([]);
  const [featuredProducts, bestProducts, recommendedProducts, latestProducts, saleProducts, popularProducts, reviews] =
    await Promise.all([
      products("featuredProducts", {}),
      products("bestProducts", { it_type1: "1" }),
      products("recommendedProducts", { it_type2: "1" }),
      products("latestProducts", { sort: "latest" }),
      products("saleProducts", { it_type5: "1" }),
      products("popularProducts", { sort: "popular" }),
      wants("reviews") ? getShopReviewsCached({ perPage }, revalidate) : Promise.resolve([]),
    ]);

  return { featuredProducts, bestProducts, recommendedProducts, latestProducts, saleProducts, popularProducts, reviews };
}

export const EMPTY_SHOP_HOME: G5ThemeShopHomeData = {
  featuredProducts: [],
  bestProducts: [],
  recommendedProducts: [],
  latestProducts: [],
  saleProducts: [],
  popularProducts: [],
  reviews: [],
};
