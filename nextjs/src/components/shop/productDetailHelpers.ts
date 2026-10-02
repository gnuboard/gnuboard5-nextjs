import { formatPrice } from "@/lib/utils";
import type { ShopProduct, ShopProductOption } from "@/lib/api";
import type { ShopCartAddResponse } from "@/services/cart";

/**
 * Pure, stateless helpers extracted from ProductDetailClient to keep that
 * component focused on rendering/state. No React, no side effects — each takes
 * arguments and returns a value, so behavior is identical to the inline originals.
 */

export interface SelectedCartOption {
  io_id: string;
  label: string;
  qty: number;
  price: number;
  stockQty: number;
  ioType: number;
}

export function cartIdsFromAddResponse(response?: { data?: ShopCartAddResponse | null }) {
  const data = response?.data;
  if (!data) return [] as string[];

  const ids = [
    data.ct_id,
    ...(data.items ?? []).map((item) => item.ct_id),
  ];

  return ids
    .filter((id): id is string | number => id !== undefined && id !== null && String(id) !== "")
    .map((id) => String(id));
}

export function productMinBuyQty(product?: ShopProduct | null) {
  return Math.max(0, Number(product?.it_buy_min_qty ?? 0));
}

export function productMaxBuyQty(product?: ShopProduct | null) {
  return Math.max(0, Number(product?.it_buy_max_qty ?? 0));
}

export function clampBuyQuantity(value: number, minQty: number, maxQty: number) {
  const normalizedMin = Math.max(1, minQty);
  const numericValue = Number.isFinite(value) ? Math.floor(value) : normalizedMin;
  let nextQty = Math.max(normalizedMin, numericValue);
  if (maxQty > 0) {
    nextQty = Math.min(Math.max(normalizedMin, maxQty), nextQty);
  }
  return nextQty;
}

export function baseOptionQty(options: SelectedCartOption[]) {
  return options.reduce((sum, option) => sum + (option.ioType === 0 ? option.qty : 0), 0);
}

export function shopOptionStockQty(option?: ShopProductOption | null) {
  return Math.max(0, Number(option?.io_stock_qty ?? 0));
}

export function isShopOptionEnabled(option?: ShopProductOption | null) {
  return Number(option?.io_use ?? 1) === 1;
}

export function isShopOptionPurchasable(option?: ShopProductOption | null) {
  // In the Youngcart backend, io_stock_qty === 0 means "unlimited stock"
  // (cart.php enforces a quantity limit only when io_stock_qty > 0), so a
  // stock of 0 must NOT be treated as sold out — doing so hides sellable
  // options behind a false "[품절]" label. An enabled option is purchasable;
  // the remaining quantity is capped separately via shopOptionStockQty when
  // it is greater than 0.
  return isShopOptionEnabled(option);
}

export function buyQtyLimitMessage(product: ShopProduct, submittedBaseQty: number) {
  const minQty = productMinBuyQty(product);
  const maxQty = productMaxBuyQty(product);

  if (submittedBaseQty <= 0) return "";
  if (minQty > 0 && submittedBaseQty < minQty) {
    return `이 상품은 최소 ${minQty}개 이상 구매해야 합니다.`;
  }
  if (maxQty > 0 && submittedBaseQty > maxQty) {
    return `이 상품은 최대 ${maxQty}개까지 구매할 수 있습니다.`;
  }
  return "";
}

export function productPointLabel(product: ShopProduct) {
  const point = Number(product.it_point ?? 0);
  if (point <= 0) return "";
  if (Number(product.it_point_type ?? 0) === 2) {
    return `구매금액(추가옵션 제외)의 ${point}%`;
  }
  return formatPrice(point);
}

export function productShippingPayment(product?: ShopProduct | null, selected = 0) {
  const scType = Number(product?.it_sc_type ?? 0);
  const scMethod = Number(product?.it_sc_method ?? 0);
  const scPrice = Number(product?.it_sc_price ?? 0);
  const scMinimum = Number(product?.it_sc_minimum ?? 0);
  const scQty = Math.max(1, Number(product?.it_sc_qty ?? 1));

  if (scType === 1) {
    return {
      label: "배송비결제",
      value: "무료배송",
      detail: "이 상품은 상품별 무료배송으로 처리됩니다.",
      ctSendCost: 2,
      selectable: false,
    };
  }

  let detail = "쇼핑몰 기본 배송비 정책을 적용합니다.";
  if (scType === 2) {
    detail = `${formatPrice(scMinimum)} 이상 구매 시 무료, 미만은 ${formatPrice(scPrice)}`;
  } else if (scType === 3) {
    detail = `${formatPrice(scPrice)} 배송비가 적용됩니다.`;
  } else if (scType > 3) {
    detail = `${scQty}개마다 ${formatPrice(scPrice)} 배송비가 적용됩니다.`;
  }

  if (scType > 1 && scMethod === 1) {
    return {
      label: "배송비결제",
      value: "수령후 지불",
      detail,
      ctSendCost: 1,
      selectable: false,
    };
  }

  if (scType > 1 && scMethod === 2) {
    const ctSendCost = selected === 1 ? 1 : 0;
    return {
      label: "배송비결제",
      value: ctSendCost === 1 ? "수령후 지불" : "주문시 결제",
      detail,
      ctSendCost,
      selectable: true,
    };
  }

  return {
    label: "배송비결제",
    value: "주문시 결제",
    detail,
    ctSendCost: 0,
    selectable: false,
  };
}

/** 주소의 ?is_id= — 찾아갈 사용후기 번호(없거나 숫자가 아니면 0). */
export function reviewFocusIdFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get("is_id") ?? "";
  return /^\d+$/.test(raw) ? Number(raw) : 0;
}

/** 주소의 ?iq_id= — 찾아갈 상품문의 번호(없거나 숫자가 아니면 0). */
export function qaFocusIdFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get("iq_id") ?? "";
  return /^\d+$/.test(raw) ? Number(raw) : 0;
}

export function productDetailTabFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const tab = (params.get("tab") ?? "").toLowerCase();
  const form = (params.get("form") ?? "").toLowerCase();

  // ?is_id= 는 후기 하나를 가리킨다(그누보드 item.php?is_id= · 사용후기 목록의 "후기 바로가기") — 사용후기 탭.
  if (form === "review" || tab === "reviews" || tab === "review" || tab === "itemuse" || reviewFocusIdFromSearch(search) > 0) {
    return "reviews";
  }
  // ?iq_id= 는 문의 하나를 가리킨다(그누보드 item.php?iq_id= · 상품문의 목록의 "문의 바로가기") — 상품문의 탭.
  // 후기와 문의를 둘 다 달고 오면 레퍼런스처럼 후기를 앞세운다(위에서 이미 돌아갔다).
  if (form === "qa" || form === "qna" || tab === "qa" || tab === "qna" || tab === "itemqa" || qaFocusIdFromSearch(search) > 0) {
    return "qa";
  }
  if (tab === "shipping" || tab === "delivery") {
    return "shipping";
  }

  return "description";
}

export function productDetailFormFromSearch(search: string) {
  const form = (new URLSearchParams(search).get("form") ?? "").toLowerCase();
  if (form === "review" || form === "itemuse") return "review";
  if (form === "qa" || form === "qna" || form === "itemqa") return "qa";
  return "";
}

export function isLegacyShortProductPath(pathname: string) {
  return /^\/shop\/[^/]+\/?$/.test(pathname);
}
