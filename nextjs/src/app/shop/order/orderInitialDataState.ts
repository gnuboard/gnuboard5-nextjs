import { type ShopCartItem, type ShopCartResponse, type ShopPolicy } from "@/lib/api";
import { toastError } from "@/lib/toast";
import type { AddressForm, SavedAddress } from "./orderAddressHelpers";
import {
  addressFromMember,
  memberDepositName,
  memberEmail,
  resolveCartShippingCost,
  selectBankAccount,
  selectEnabledPaymentMethod,
  type OrderMember,
} from "./orderDataHelpers";
import { loadMemberOrderBenefits } from "./orderDataActions";
import type { PaymentConfig } from "./orderPaymentHelpers";
import type { MyCoupon } from "./orderPricingHelpers";

type StateSetter<T> = (value: T | ((prev: T) => T)) => void;

export type OrderInitialDataSetters = {
  setItems: StateSetter<ShopCartItem[]>;
  setLoading: StateSetter<boolean>;
  setPaymentMethod: StateSetter<string>;
  setPaymentConfig: StateSetter<PaymentConfig | null>;
  setShippingPolicy: StateSetter<ShopPolicy | null>;
  setCartShippingCost: StateSetter<number | null>;
  setBankAccount: StateSetter<string>;
  setDepositName: StateSetter<string>;
  setEmail: StateSetter<string>;
  setSavedAddresses: StateSetter<SavedAddress[]>;
  setIsMemberOrder: StateSetter<boolean>;
  setMyCoupons: StateSetter<MyCoupon[]>;
  setPointBalance: StateSetter<number>;
  setOrderer: StateSetter<AddressForm>;
};

type PaymentConfigSetters = Pick<
  OrderInitialDataSetters,
  "setBankAccount" | "setPaymentConfig" | "setPaymentMethod"
>;

type CartDataSetters = Pick<OrderInitialDataSetters, "setCartShippingCost">;

type MemberBenefitSetters = Pick<
  OrderInitialDataSetters,
  "setMyCoupons" | "setPointBalance"
> & {
  shouldApply?: () => boolean;
};

type MemberDataSetters = Pick<
  OrderInitialDataSetters,
  "setDepositName" | "setEmail" | "setIsMemberOrder" | "setOrderer"
>;

type FailureSetters = Pick<
  OrderInitialDataSetters,
  "setCartShippingCost" | "setShippingPolicy"
>;

export function applyInitialPaymentConfig(
  config: PaymentConfig | null,
  { setBankAccount, setPaymentConfig, setPaymentMethod }: PaymentConfigSetters
): void {
  if (!config) return;

  setPaymentConfig(config);
  setPaymentMethod((prev) => selectEnabledPaymentMethod(prev, config));
  if (config.bank_accounts?.length) {
    setBankAccount((prev) => selectBankAccount(prev, config));
  }
}

export function applyInitialCartData(
  cartData: ShopCartResponse | undefined,
  { setCartShippingCost }: CartDataSetters
): ShopCartItem[] {
  setCartShippingCost(resolveCartShippingCost(cartData));
  return cartData?.items ?? [];
}

export function loadInitialMemberBenefits({
  setMyCoupons,
  setPointBalance,
  shouldApply,
}: MemberBenefitSetters): void {
  loadMemberOrderBenefits()
    .then(({ coupons, pointBalance, couponsLoadFailed, pointLoadFailed }) => {
      if (shouldApply && !shouldApply()) return;
      if (coupons) setMyCoupons(coupons);
      if (typeof pointBalance === "number") {
        setPointBalance(pointBalance);
      }
      if (couponsLoadFailed || pointLoadFailed) {
        toastError(
          "쿠폰 또는 포인트 정보를 불러오지 못했습니다. 혜택 적용이 필요하면 새로고침 후 다시 시도해 주세요."
        );
      }
    })
    .catch(() => {
      if (shouldApply && !shouldApply()) return;
      toastError(
        "쿠폰 또는 포인트 정보를 불러오지 못했습니다. 혜택 적용이 필요하면 새로고침 후 다시 시도해 주세요."
      );
    });
}

export function applyInitialMemberData(
  member: OrderMember | undefined,
  { setDepositName, setEmail, setIsMemberOrder, setOrderer }: MemberDataSetters
): void {
  setIsMemberOrder(Boolean(member));
  if (!member) return;

  setOrderer(addressFromMember(member));
  setEmail(memberEmail(member));
  setDepositName(memberDepositName(member));
}

export function resetInitialOrderData({
  setCartShippingCost,
  setShippingPolicy,
}: FailureSetters): void {
  setShippingPolicy(null);
  setCartShippingCost(null);
}
