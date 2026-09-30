import { expect, test } from "@playwright/test";
import type { AddressForm } from "../src/app/shop/order/orderAddressHelpers";
import type {
  PaymentConfig,
  PaymentNotice,
} from "../src/app/shop/order/orderPaymentHelpers";
import {
  submitOrder,
  type OrderSubmitHandlerDeps,
  type UseOrderSubmitOptions,
} from "../src/app/shop/order/orderSubmitHandler";

type BankInput = Parameters<OrderSubmitHandlerDeps["submitBankOrder"]>[0];
type PaymentInput = Parameters<OrderSubmitHandlerDeps["submitPaymentOrder"]>[0];

function address(overrides: Partial<AddressForm> = {}): AddressForm {
  return {
    name: "Buyer",
    tel: "02-1234-5678",
    hp: "010-1234-5678",
    zip: "12345",
    addr1: "Seoul",
    addr2: "101",
    addr3: "",
    addr_jibeon: "N",
    ...overrides,
  };
}

function paymentConfig(): PaymentConfig {
  return {
    pg_service: "inicis",
    client: {
      client_key: "client-key",
    },
    payment_methods: {
      card: true,
      vbank: true,
      bank: true,
      iche: true,
      hp: true,
      easy_pay: true,
      kakaopay: true,
    },
    is_test_mode: true,
  };
}

function submitOptions(
  overrides: Partial<UseOrderSubmitOptions> = {}
): UseOrderSubmitOptions {
  return {
    orderer: address({ name: "Buyer" }),
    recipient: address({ name: "Receiver", addr1: "Busan" }),
    addressSelection: "new",
    saveAsNewAddress: true,
    newAddressSubject: "",
    newAddressDefault: true,
    email: "buyer@example.com",
    memo: "Leave at door",
    hopeDate: "2026-06-20",
    taxRequest: true,
    cashRequest: false,
    guestPassword: "guest123",
    isMemberOrder: false,
    paymentMethod: "bank",
    paymentConfig: paymentConfig(),
    bankAccount: "Bank 123",
    depositName: "Buyer",
    agreeTerms: true,
    agreePrivacy: true,
    selectedCouponId: "coupon-order",
    selectedSendCouponId: "coupon-send",
    pointUse: 1200,
    directCheckout: true,
    directCtIds: "10,11",
    setSubmitting: () => undefined,
    setPaymentNotice: () => undefined,
    ...overrides,
  };
}

function router() {
  return {
    push: () => undefined,
    replace: () => undefined,
  };
}

function buildDeps(
  overrides: Partial<OrderSubmitHandlerDeps> = {}
): Partial<OrderSubmitHandlerDeps> & {
  bankCalls: BankInput[];
  paymentCalls: PaymentInput[];
  toastErrors: string[];
} {
  const bankCalls: BankInput[] = [];
  const paymentCalls: PaymentInput[] = [];
  const toastErrors: string[] = [];

  return {
    bankCalls,
    paymentCalls,
    toastErrors,
    isMobileDevice: () => false,
    submitBankOrder: async (input) => {
      bankCalls.push(input);
      input.setSubmitting(false);
    },
    submitPaymentOrder: async (input) => {
      paymentCalls.push(input);
    },
    toastError: (message) => {
      toastErrors.push(message);
    },
    ...overrides,
  };
}

test.describe("order submit handler", () => {
  test("reports validation failures without starting submission", async () => {
    const submittingCalls: boolean[] = [];
    const noticeCalls: Array<PaymentNotice | null> = [];
    const deps = buildDeps({
      validateOrderSubmission: () => ({
        ok: false,
        message: "invalid order",
      }),
    });

    await submitOrder({
      ...submitOptions({
        setSubmitting: (submitting) => submittingCalls.push(submitting),
        setPaymentNotice: (notice) => noticeCalls.push(notice),
      }),
      router: router(),
      origin: "https://shop.example.com",
      deps,
    });

    expect(deps.toastErrors).toEqual(["invalid order"]);
    expect(submittingCalls).toEqual([]);
    expect(noticeCalls).toEqual([]);
    expect(deps.bankCalls).toEqual([]);
    expect(deps.paymentCalls).toEqual([]);
  });

  test("builds and submits bank orders with address-save fields in the order body", async () => {
    const submittingCalls: boolean[] = [];
    const noticeCalls: Array<PaymentNotice | null> = [];
    const deps = buildDeps();

    await submitOrder({
      ...submitOptions({
        setSubmitting: (submitting) => submittingCalls.push(submitting),
        setPaymentNotice: (notice) => noticeCalls.push(notice),
      }),
      router: router(),
      origin: "https://shop.example.com",
      deps,
    });

    expect(deps.toastErrors).toEqual([]);
    expect(submittingCalls).toEqual([true, false]);
    expect(noticeCalls).toEqual([null]);
    expect(deps.bankCalls).toHaveLength(1);
    expect(deps.paymentCalls).toEqual([]);
    expect(deps.bankCalls[0]).toMatchObject({
      bankAccount: "Bank 123",
      depositName: "Buyer",
    });
    expect(deps.bankCalls[0].orderBody).toMatchObject({
      od_name: "Buyer",
      od_b_name: "Receiver",
      od_b_zip1: "123",
      od_b_zip2: "45",
      cp_id: "coupon-order",
      cp_id_send: "coupon-send",
      point_use: 1200,
      direct: 1,
      ct_ids: "10,11",
      save_address: 1,
      ad_default: 1,
      payment_device: "pc",
    });
  });

  test("builds and submits card payments with mobile payment device", async () => {
    const progressNotice: PaymentNotice = {
      tone: "info",
      title: "Payment",
      message: "Processing",
    };
    const submittingCalls: boolean[] = [];
    const noticeCalls: Array<PaymentNotice | null> = [];
    const paymentCalls: PaymentInput[] = [];
    const deps = buildDeps({
      isMobileDevice: () => true,
      submitPaymentOrder: async (input) => {
        paymentCalls.push(input);
        input.setPaymentNotice(progressNotice);
      },
    });

    await submitOrder({
      ...submitOptions({
        addressSelection: "same",
        paymentMethod: "card",
        bankAccount: "",
        depositName: "",
        setSubmitting: (submitting) => submittingCalls.push(submitting),
        setPaymentNotice: (notice) => noticeCalls.push(notice),
      }),
      router: router(),
      origin: "https://shop.example.com",
      deps,
    });

    expect(deps.toastErrors).toEqual([]);
    expect(submittingCalls).toEqual([true]);
    expect(noticeCalls).toEqual([null, progressNotice]);
    expect(deps.bankCalls).toEqual([]);
    expect(paymentCalls).toHaveLength(1);
    expect(paymentCalls[0]).toMatchObject({
      paymentConfig: paymentConfig(),
      origin: "https://shop.example.com",
      methodDef: {
        value: "card",
        pg_method: "card",
      },
    });
    expect(paymentCalls[0].orderBody).toMatchObject({
      od_name: "Buyer",
      od_b_name: "Buyer",
      payment_device: "mobile",
    });
  });
});
