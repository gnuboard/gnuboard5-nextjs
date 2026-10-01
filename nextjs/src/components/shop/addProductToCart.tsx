"use client";

import { ToastAction } from "@/components/ui/toast";
import type { ShopProduct } from "@/lib/api";
import { gaAddToCart } from "@/lib/analytics";
import { notifyCartChanged } from "@/lib/cart-events";
import { g5ShortHref } from "@/lib/g5-short-url";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { toastSuccess } from "@/lib/toast";
import { addCartItem, addCartItems } from "@/services/cart";
import type { SelectedCartOption } from "@/app/shop/products/[it_id]/productDetailHelpers";

type RouterLike = Parameters<typeof runtimeRouterPush>[0];

export interface AddProductToCartInput {
  product: ShopProduct;
  /** 옵션 없이 본품만 담을 때의 수량 */
  quantity: number;
  /** 고른 선택옵션 · 추가옵션(useProductOptions 의 buildSelectedCartOptions) */
  cartOptions: SelectedCartOption[];
  /** 선택옵션 제목이 있는 상품인가 — 없으면 추가옵션 앞에 본품을 먼저 담는다 */
  hasOptionSubjects: boolean;
  /** 배송비 결제 방법(productShippingPayment().ctSendCost) */
  ctSendCost?: number;
}

/**
 * 장바구니에 담는다 — 상품 상세의 구매 상자와 상품 카드의 빠른 담기가 같은 순서로 부른다.
 * 추가옵션만 고른 경우 서버는 본품 없이 추가옵션을 받지 않으므로 본품을 먼저 담는다.
 * 실패하면 API 오류를 그대로 던진다(부르는 쪽이 알림으로 보여 준다).
 */
export async function addProductToCart({
  product,
  quantity,
  cartOptions,
  hasOptionSubjects,
  ctSendCost,
}: AddProductToCartInput): Promise<void> {
  if (cartOptions.length > 0) {
    if (!hasOptionSubjects) {
      await addCartItem(product.it_id, quantity, "", { ctSendCost });
    }
    await addCartItems(
      product.it_id,
      cartOptions.map((option) => ({ io_id: option.io_id, ct_qty: option.qty })),
      { ctSendCost }
    );
  } else {
    await addCartItem(product.it_id, quantity, "", { ctSendCost });
  }

  // GA4 add_to_cart — 옵션 합계 수량 + 단가 기준.
  gaAddToCart({
    item_id: product.it_id,
    item_name: product.it_name,
    item_category: product.ca_name,
    item_brand: product.it_brand,
    price: product.it_price,
    quantity: cartOptions.length > 0 ? cartOptions.reduce((sum, option) => sum + option.qty, 0) : quantity,
  });
  notifyCartChanged();
}

/** "장바구니에 추가되었습니다 [바로가기]" — 담은 뒤 그 자리에 머물면서 장바구니로 갈 길을 준다. */
export function toastAddedToCart(router: RouterLike) {
  toastSuccess("장바구니에 추가되었습니다.", {
    action: (
      <ToastAction
        altText="장바구니 페이지로 이동"
        onClick={() => runtimeRouterPush(router, g5ShortHref("/shop/cart"))}
      >
        바로가기
      </ToastAction>
    ),
  });
}
