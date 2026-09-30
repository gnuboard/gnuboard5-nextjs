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
