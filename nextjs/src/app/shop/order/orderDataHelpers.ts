import type { ShopCartResponse } from "@/lib/api";
import {
  EMPTY_ADDRESS,
  type AddressForm,
} from "./orderAddressHelpers";
import {
  PAYMENT_METHODS,
  isPaymentMethodEnabled,
  type PaymentConfig,
} from "./orderPaymentHelpers";

export type OrderMember = Record<string, string | number | undefined>;

export function buildCartRequestOptions(
  directCheckout: boolean,
  directCtIds: string
): { params?: Record<string, unknown> } | undefined {
  if (!directCtIds && !directCheckout) return undefined;

  return {
    params: {
      ...(directCtIds ? { ct_ids: directCtIds } : {}),
      ...(directCheckout ? { direct: 1 } : {}),
    },
  };
}

/** 서버가 한 요청에서 받는 줄 수(shop_api_cart_ct_ids_from) — 넘는 줄은 서버가 조용히 잘라 낸다. */
export const MAX_ORDER_CT_IDS = 100;

/**
 * 주문서가 보여 준 장바구니 줄 — 주문 · 결제 준비 · 배송비 견적에 이 줄만 보낸다. 불러온 줄이 있으면 그 줄(주소의
 * ct_ids 로 불렀어도 실제로 받은 줄 — 장바구니가 바뀌어 다시 불렀으면 남은 줄만), 아직 없으면 주소의 ct_ids.
 * 주문서를 띄운 뒤 다른 탭 · 기기에서 장바구니가 바뀌어도(담기 · 장바구니 모으기) 본 것과 다른 주문이 생기지
 * 않는다 — 서버는 보낸 줄이 하나라도 없으면 409(CART_CHANGED)로 멈춘다.
 * 서버가 받는 수보다 많으면 줄을 정하지 않는다(잘린 줄만 주문되지 않게, 예전처럼 주소의 ct_ids 또는 장바구니 전부).
 */
export function shownOrderCtIds(
  directCtIds: string,
  items: ReadonlyArray<{ ct_id: string | number }>
): string {
  if (items.length === 0 || items.length > MAX_ORDER_CT_IDS) return directCtIds;
  return items.map((item) => String(item.ct_id)).join(",");
}

export function resolveCartShippingCost(
  cartData: ShopCartResponse | undefined
): number | null {
  if (typeof cartData?.shipping_cost === "number") {
    return cartData.shipping_cost;
  }
  if (typeof cartData?.send_cost === "number") {
    return cartData.send_cost;
  }
  return null;
}

export function selectEnabledPaymentMethod(
  currentMethod: string,
  config: PaymentConfig
): string {
  const current = PAYMENT_METHODS.find((method) => method.value === currentMethod);
  if (current && isPaymentMethodEnabled(current, config)) return currentMethod;

  return (
    PAYMENT_METHODS.find((method) => isPaymentMethodEnabled(method, config))
      ?.value ?? currentMethod
  );
}

export function selectBankAccount(
  currentAccount: string,
  config: PaymentConfig
): string {
  if (!config.bank_accounts?.length) return currentAccount;

  return currentAccount && config.bank_accounts.includes(currentAccount)
    ? currentAccount
    : config.bank_accounts[0] ?? "";
}

export function addressFromMember(member: OrderMember | undefined): AddressForm {
  if (!member) return EMPTY_ADDRESS;

  const zip1 = String(member.mb_zip1 ?? "");
  const zip2 = String(member.mb_zip2 ?? "");

  return {
    name: String(member.mb_name ?? ""),
    tel: String(member.mb_tel ?? ""),
    hp: String(member.mb_hp ?? ""),
    zip: (zip1 + zip2).trim(),
    addr1: String(member.mb_addr1 ?? ""),
    addr2: String(member.mb_addr2 ?? ""),
    addr3: String(member.mb_addr3 ?? ""),
    addr_jibeon: String(member.mb_addr_jibeon ?? ""),
  };
}

export function memberEmail(member: OrderMember | undefined): string {
  return String(member?.mb_email ?? "");
}

export function memberDepositName(member: OrderMember | undefined): string {
  return String(member?.mb_name ?? "");
}

export function buildShippingQuoteParams({
  shippingZip,
  directCheckout,
  directCtIds,
}: {
  shippingZip: string;
  directCheckout: boolean;
  directCtIds: string;
}) {
  return {
    zip1: shippingZip.slice(0, 3),
    zip2: shippingZip.slice(3),
    ...(directCtIds ? { ct_ids: directCtIds } : {}),
    ...(directCheckout ? { direct: 1 } : {}),
  };
}
