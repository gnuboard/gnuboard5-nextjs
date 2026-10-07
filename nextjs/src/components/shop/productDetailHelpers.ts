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

/** 옵션 io_id 의 단계 구분자(영카트 chr(30)) — 선택옵션 "값1␞값2", 추가옵션 "항목␞값". */
export const OPTION_SEPARATOR = "\x1e";

export interface SupplyOptionGroup {
  subject: string;
  options: ShopProductOption[];
}

/**
 * 추가옵션을 항목(it_supply_subject)마다 묶는다 — 영카트 get_item_supply()(lib/shop.lib.php)처럼 항목마다
 * select 하나. 추가옵션 io_id 는 "항목␞값"이고, 항목 이름에 없는 io_id 는 영카트처럼 보이지 않는다.
 */
export function supplyOptionGroups(subjectText: string | undefined, supplyOptions: ShopProductOption[]): SupplyOptionGroup[] {
  return (subjectText || "")
    .split(",")
    .filter(Boolean)
    .map((subject) => ({
      subject,
      options: supplyOptions.filter((option) => {
        const [prefix, value] = String(option.io_id || "").split(OPTION_SEPARATOR);
        return prefix === subject && Boolean(value);
      }),
    }))
    .filter((group) => group.options.length > 0);
}

/** 영카트 옵션 글자의 값 뒤 금액 — "  + 5,900원" · 음수는 "  -1,000원" (get_item_options · get_item_supply). */
export function optionPriceSuffix(price: number) {
  return price >= 0 ? `  + ${formatPrice(price)}` : `  ${formatPrice(price)}`;
}

/** 고른 옵션 줄의 이름 — 영카트 io_value 와 같다. 선택옵션 "색상:실버 / 크기:L", 추가옵션 "항목:값". */
export function baseOptionLabel(subjects: string[], ioId: string) {
  const values = ioId.split(OPTION_SEPARATOR);
  return subjects.map((subject, index) => `${subject}:${values[index] ?? ""}`).join(" / ");
}

export function supplyOptionLabel(ioId: string) {
  const [subject, value = ""] = ioId.split(OPTION_SEPARATOR);
  return `${subject}:${value}`;
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
  // 영카트와 같다 — 옵션 재고(io_stock_qty)가 1 미만이면 품절이다. 상품 화면은 그 옵션에 "[품절]"을 붙이고
  // (lib/shop.lib.php 의 옵션 고르기), 담기는 재고를 넘으면 거절한다(cartupdate.php · 우리 API 의
  // shop_api_cart_assert_stock). 예전에는 0 을 "무제한"으로 보고 고르게 두어, 담는 순간 품절로 거절됐다.
  return isShopOptionEnabled(option) && Number(option?.io_stock_qty ?? 0) >= 1;
}

/** 선택옵션이 있는데 모두 품절인가 — 영카트 is_soldout() 처럼 그 상품은 품절이다(고를 옵션이 없다). */
export function hasOnlySoldOutBaseOptions(options?: ShopProductOption[] | null) {
  const baseOptions = (options ?? []).filter(
    (option) => Number(option.io_type) === 0 && isShopOptionEnabled(option)
  );
  return baseOptions.length > 0 && baseOptions.every((option) => !isShopOptionPurchasable(option));
}

/**
 * 상품 상세의 품절 — 영카트 is_soldout() 과 같다: 품절 표시(it_soldout), 선택옵션 상품은 선택옵션이 모두 품절,
 * 옵션 없는 상품(추가옵션만 있는 상품 포함)은 상품 재고 0 이하. 상세 응답에는 옵션 목록이 있어 목록 카드의
 * isProductSoldOut 보다 정확하다. 서버도 이 상품들은 담기에서 품절로 거절한다(shop_api_cart_assert_stock).
 */
export function isProductDetailSoldOut(
  product: Pick<ShopProduct, "it_soldout" | "it_stock_qty" | "options">
) {
  if (String(product.it_soldout ?? "0") === "1") return true;
  const hasBaseOptions = (product.options ?? []).some(
    (option) => Number(option.io_type) === 0 && isShopOptionEnabled(option)
  );
  return hasBaseOptions
    ? hasOnlySoldOutBaseOptions(product.options)
    : Number(product.it_stock_qty ?? 0) <= 0;
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
