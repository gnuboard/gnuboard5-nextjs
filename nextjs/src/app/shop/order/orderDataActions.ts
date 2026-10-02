import {
  api,
  type ShopCartResponse,
  type ShopPolicy,
  type ShopShippingQuote,
} from "@/lib/api";
import { getShopPolicy, getShopShippingQuote } from "@/services/shop";
import type { SavedAddress } from "./orderAddressHelpers";
import {
  buildCartRequestOptions,
  buildShippingQuoteParams,
  type OrderMember,
} from "./orderDataHelpers";
import type { PaymentConfig } from "./orderPaymentHelpers";
import type { MyCoupon, PointSummary } from "./orderPricingHelpers";

type LoadOrderInitialDataInput = {
  directCheckout: boolean;
  directCtIds: string;
};

type LoadOrderInitialDataResult = {
  cartData: ShopCartResponse | undefined;
  paymentConfig: PaymentConfig | null;
  shippingPolicy: ShopPolicy | null;
  member: OrderMember | undefined;
  savedAddresses: SavedAddress[];
};

type LoadShippingQuoteInput = {
  shippingZip: string;
  directCheckout: boolean;
  directCtIds: string;
};

export async function loadOrderInitialData({
  directCheckout,
  directCtIds,
}: LoadOrderInitialDataInput): Promise<LoadOrderInitialDataResult> {
  const [cartRes, payCfgRes, policyRes] = await Promise.all([
    api.get<ShopCartResponse>(
      "/shop/cart",
      buildCartRequestOptions(directCheckout, directCtIds)
    ),
    api.get<PaymentConfig>("/shop/payment/config").catch(() => null),
    getShopPolicy().catch(() => null),
  ]);

  const cartData = cartRes.data;
  const hasCartItems = (cartData?.items?.length ?? 0) > 0;
  const shouldLoadMember = hasCartItems && api.hasAuthHint();
  const meRes = shouldLoadMember
    ? await api.get<{ member: OrderMember | null }>("/members/me").catch(() => null)
    : null;
  const member = meRes?.data?.member ?? undefined;
  const addrRes = member
    ? await api
        .get<SavedAddress[]>("/shop/addresses")
        .catch(() => ({ data: [] as SavedAddress[] }))
    : { data: [] as SavedAddress[] };

  return {
    cartData,
    paymentConfig: payCfgRes?.data ?? null,
    shippingPolicy: policyRes,
    member,
    savedAddresses: (addrRes.data ?? []) as SavedAddress[],
  };
}

/** 주문서의 상품 줄만 다시 받는다 — 주문 · 결제 준비가 장바구니가 바뀌었다고(CART_CHANGED) 멈췄을 때. */
export async function loadOrderCartData({
  directCheckout,
  directCtIds,
}: LoadOrderInitialDataInput): Promise<ShopCartResponse | undefined> {
  const cartRes = await api.get<ShopCartResponse>(
    "/shop/cart",
    buildCartRequestOptions(directCheckout, directCtIds)
  );
  return cartRes.data;
}

export async function loadMemberOrderBenefits(): Promise<{
  coupons?: MyCoupon[];
  pointBalance?: number;
  couponsLoadFailed: boolean;
  pointLoadFailed: boolean;
}> {
  const [couponRes, pointRes] = await Promise.allSettled([
    api.get<MyCoupon[]>("/shop/coupons/mine"),
    api.get<PointSummary>("/shop/points/summary"),
  ]);
  const coupons =
    couponRes.status === "fulfilled" && Array.isArray(couponRes.value.data)
      ? couponRes.value.data
      : undefined;
  const pointBalance =
    pointRes.status === "fulfilled" &&
    typeof pointRes.value.data?.balance === "number"
      ? pointRes.value.data.balance
      : undefined;

  return {
    coupons,
    pointBalance,
    couponsLoadFailed: couponRes.status === "rejected",
    pointLoadFailed: pointRes.status === "rejected",
  };
}

export function loadShippingQuote({
  shippingZip,
  directCheckout,
  directCtIds,
}: LoadShippingQuoteInput): Promise<ShopShippingQuote | null> {
  return getShopShippingQuote(
    buildShippingQuoteParams({ shippingZip, directCheckout, directCtIds })
  );
}
