import type { ShopProduct } from "@/lib/shop-types";
import { formatPrice } from "@/lib/utils";

/**
 * 영카트 is_soldout() 과 같은 품절 판정.
 * 목록 API 가 준 is_soldout(서버가 옵션 재고 · 주문 대기까지 센 값)이 있으면 그것을 쓴다 —
 * 선택옵션이 모두 품절인 상품은 목록 데이터만으로는 알 수 없다.
 * 없으면(상품 상세 · 오래된 API) 품절 표시, 또는 옵션 없는 상품의 재고 0 이하로 판정한다.
 * 선택옵션 상품은 재고를 옵션마다 따로 세므로 상품 재고(it_stock_qty)로 품절을 정하지 않는다.
 *
 * 서버 컴포넌트(테마 쇼핑 홈)와 클라이언트 카드가 함께 부르므로 "use client" 파일에 두지 않는다.
 */
export function isProductSoldOut(
  product: Pick<ShopProduct, "it_soldout" | "it_stock_qty" | "has_options" | "is_soldout">
): boolean {
  if (String(product.it_soldout ?? "0") === "1") return true;
  if (typeof product.is_soldout === "boolean") return product.is_soldout;
  return product.has_options !== true && Number(product.it_stock_qty) <= 0;
}

/** 가격 칸에 쓰는 상품 정보 — 목록 줄 · 장바구니 줄 · 위시 줄 · 비교 줄이 모두 이 정도는 갖는다. */
export interface ProductPriceSource {
  it_price?: number | null;
  it_cust_price?: number | null;
  it_tel_inq?: string | number | null;
}

/** 전화문의 상품인가(영카트 it_tel_inq). 온라인으로 담거나 살 수 없고 가격 대신 "전화문의"를 보인다. */
export function isTelInquiry(item?: Pick<ProductPriceSource, "it_tel_inq"> | null): boolean {
  return String(item?.it_tel_inq ?? "0") === "1";
}

/** 할인으로 보이는가: 전화문의가 아니고, 판매가 > 0, 정가 > 판매가. (판매가 0 이면 "100%" 가 나오지 않게 뺀다.) */
export function hasProductDiscount(item: ProductPriceSource): boolean {
  const price = Number(item.it_price ?? 0);
  const cust = Number(item.it_cust_price ?? 0);
  return !isTelInquiry(item) && price > 0 && cust > price;
}

/** 할인율(%) — 할인이 아니면 0. 상품 목록 · 상세 · 앱 기본 카드 · 테마 카드가 같은 값을 보인다. */
export function productDiscountPercent(item: ProductPriceSource): number {
  if (!hasProductDiscount(item)) return 0;
  const price = Number(item.it_price ?? 0);
  const cust = Number(item.it_cust_price ?? 0);
  return Math.round(((cust - price) / cust) * 100);
}

/** 가격 칸 글자: 전화문의면 "전화문의", 아니면 원 단위 가격. 위시처럼 다른 가격 칸(it_basic_price)은 price 로 넘긴다. */
export function formatProductPrice(item: ProductPriceSource, price: number | null | undefined = item.it_price): string {
  return isTelInquiry(item) ? "전화문의" : formatPrice(price);
}
