import type { ShopProduct } from "@/lib/shop-types";

/**
 * 영카트 is_soldout() 과 같은 품절 판정: 품절 표시가 켜졌거나, 옵션 없는 상품의 재고가 0 이하.
 * 선택옵션 상품은 재고를 옵션마다 따로 세므로 상품 재고(it_stock_qty)로 품절을 정하지 않는다 —
 * 옵션 재고는 옵션 고르기 창에서 옵션마다 [품절]로 보인다.
 *
 * 서버 컴포넌트(테마 쇼핑 홈)와 클라이언트 카드가 함께 부르므로 "use client" 파일에 두지 않는다.
 */
export function isProductSoldOut(
  product: Pick<ShopProduct, "it_soldout" | "it_stock_qty" | "has_options">
): boolean {
  if (String(product.it_soldout ?? "0") === "1") return true;
  return product.has_options !== true && Number(product.it_stock_qty) <= 0;
}
