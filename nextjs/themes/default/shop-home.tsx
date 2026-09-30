import type { ShopBanner, ShopCategory } from "@/lib/shop-types";
import type { G5ThemeComponentProps } from "@/lib/theme-types";
import type { WritePost } from "@/lib/types";
import { getBoardPosts } from "@/services/boards";
import { getPublicSettings } from "@/services/settings";
import { getShopBanners } from "@/services/shop";
import { getCachedShopCategories } from "@/services/shop-categories";
import { SoluneShopHomeClient, EMPTY_SHOP_HOME, NOTICE_BOARD, NOTICE_COUNT } from "./shop-home-client";

/**
 * 쇼핑 홈. 슬롯이 주는 상품 묶음(히트·추천·최신·할인·인기·후기)에 더해,
 * 레퍼런스 index.php 가 그리는 배너·분류 행·공지를 여기서 읽어 초기값으로 넘긴다.
 * 본체(shop-home-client)는 붙은 뒤 브라우저에서 같은 것을 한 번 더 받아 갈아 끼운다.
 * 어느 하나가 실패해도 나머지는 그려지도록 개별로 감싼다.
 */
export async function SoluneShopHomePage({ config, shopHome }: G5ThemeComponentProps) {
  const [banners, categories, noticeResult, settings] = await Promise.all([
    getShopBanners({ position: "메인", device: "all" }).catch(() => [] as ShopBanner[]),
    getCachedShopCategories().catch(() => [] as ShopCategory[]),
    getBoardPosts({ boTable: NOTICE_BOARD, perPage: NOTICE_COUNT }).catch(() => ({ list: [] as WritePost[] })),
    getPublicSettings().catch(() => null),
  ]);

  return (
    <SoluneShopHomeClient
      config={config}
      initialHome={shopHome ?? EMPTY_SHOP_HOME}
      initialExtras={{
        banners,
        categories,
        notices: noticeResult.list,
        rewriteMode: settings?.cf_bbs_rewrite ?? 0,
        // 사업자 정보 · 입금 계좌는 브라우저 갱신에서 받는다(정적 빌드에 한 설치본의 값을 굽지 않는다).
        company: null,
        bankAccounts: [],
      }}
    />
  );
}
