import { expect, test } from "@playwright/test";
import type {
  PaymentConfig,
  PaymentNotice,
  PayMethodDef,
} from "../src/app/shop/order/orderPaymentHelpers";
import { PAYMENT_NOTICE_AUTO_DISMISS_MS } from "../src/app/shop/order/orderPaymentHelpers";
import {
  CART_CHANGED_MESSAGE,
  PAYMENT_PREPARING_NOTICE,
} from "../src/app/shop/order/orderSubmitFeedback";
import {
  submitBankOrder,
  submitPaymentOrder,
  type OrderSubmitFlowDeps,
} from "../src/app/shop/order/orderSubmitFlow";
import type {
  CreatedOrderResponse,
  OrderBody,
} from "../src/app/shop/order/orderSubmitTypes";

type RouterCall = {
  href: string;
  mode: "push";
};

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

function paymentMethod(overrides: Partial<PayMethodDef> = {}): PayMethodDef {
  return {
    value: "card",
    label: "Card",
    settle_case: "Card",
    pg_method: "card",
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<OrderSubmitFlowDeps> = {}
): Partial<OrderSubmitFlowDeps> & {
  routerCalls: RouterCall[];
  toastErrors: Array<{ message: string; duration?: number }>;
  toastSuccesses: string[];
} {
  const routerCalls: RouterCall[] = [];
  const toastErrors: Array<{ message: string; duration?: number }> = [];
  const toastSuccesses: string[] = [];

  return {
    routerCalls,
    toastErrors,
    toastSuccesses,
    createBankOrder: async () => ({ od_id: "order-1" }),
    requestPreparedOrderPayment: async () => undefined,
    routerPush: (router, href) => {
      routerCalls.push({ href, mode: "push" });
      router.push(href);
    },
    toastError: (message, options = {}) => {
      toastErrors.push({ message, duration: options.duration });
    },
    toastSuccess: (message) => {
      toastSuccesses.push(message);
    },
    ...overrides,
  };
}

test.describe("order submit flow", () => {
  test("submits bank orders and routes to the created order", async () => {
    const orderBody: OrderBody = { od_name: "Buyer" };
    const setSubmittingCalls: boolean[] = [];
    const routerPushes: string[] = [];
    const deps = buildDeps({
      createBankOrder: async (input) => {
        expect(input).toEqual({
          orderBody,
          bankAccount: "Bank 123",
          depositName: "Buyer",
        });

        return {
          order: {
            od_id: "202606100001",
            uid: "guest uid",
          },
        } satisfies CreatedOrderResponse;
      },
    });

    await submitBankOrder({
      orderBody,
      bankAccount: "Bank 123",
      depositName: "Buyer",
      router: {
        push: (href) => routerPushes.push(href),
        replace: () => undefined,
      },
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      deps,
    });

    expect(deps.toastSuccesses).toHaveLength(1);
    expect(deps.toastErrors).toEqual([]);
    expect(routerPushes).toEqual([
      "/shop/orders/202606100001?uid=guest%20uid",
    ]);
    expect(deps.routerCalls).toEqual([
      {
        href: "/shop/orders/202606100001?uid=guest%20uid",
        mode: "push",
      },
    ]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("reports bank order failures and clears submitting state", async () => {
    const setSubmittingCalls: boolean[] = [];
    const deps = buildDeps({
      createBankOrder: async () => {
        throw new Error("bank failed");
      },
    });

    await submitBankOrder({
      orderBody: { od_name: "Buyer" },
      bankAccount: "Bank 123",
      depositName: "Buyer",
      router: {
        push: () => undefined,
        replace: () => undefined,
      },
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      deps,
    });

    expect(deps.toastErrors).toEqual([{ message: "bank failed" }]);
    expect(deps.toastSuccesses).toEqual([]);
    expect(deps.routerCalls).toEqual([]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("reloads the shown rows when the cart changed under a bank order", async () => {
    const setSubmittingCalls: boolean[] = [];
    let reloads = 0;
    const deps = buildDeps({
      createBankOrder: async () => {
        throw Object.assign(new Error("장바구니가 바뀌었습니다."), { code: "CART_CHANGED" });
      },
    });

    await submitBankOrder({
      orderBody: { od_name: "Buyer", ct_ids: "1,2" },
      bankAccount: "Bank 123",
      depositName: "Buyer",
      router: {
        push: () => undefined,
        replace: () => undefined,
      },
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      onCartChanged: () => {
        reloads += 1;
      },
      deps,
    });

    expect(reloads).toBe(1);
    expect(deps.toastErrors).toEqual([{ message: CART_CHANGED_MESSAGE }]);
    expect(deps.routerCalls).toEqual([]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("reloads the hope date rule when the server rejects the hope date (bank)", async () => {
    const setSubmittingCalls: boolean[] = [];
    let reloads = 0;
    const message = "희망배송일은 2026-10-10 부터 2026-10-16 사이에서 선택해 주십시오.";
    const deps = buildDeps({
      createBankOrder: async () => {
        throw Object.assign(new Error(message), { code: "HOPE_DATE" });
      },
    });

    await submitBankOrder({
      orderBody: { od_name: "Buyer", ct_ids: "1,2" },
      bankAccount: "Bank 123",
      depositName: "Buyer",
      router: { push: () => undefined, replace: () => undefined },
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      onCartChanged: () => {
        throw new Error("cart reload must not run");
      },
      onHopeDateRejected: () => {
        reloads += 1;
      },
      deps,
    });

    expect(reloads).toBe(1);
    expect(deps.toastErrors).toEqual([{ message }]);
    expect(deps.routerCalls).toEqual([]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("rejects bank order responses without an order id", async () => {
    const setSubmittingCalls: boolean[] = [];
    const routerPushes: string[] = [];
    const deps = buildDeps({
      createBankOrder: async () => undefined,
    });

    await submitBankOrder({
      orderBody: { od_name: "Buyer" },
      bankAccount: "Bank 123",
      depositName: "Buyer",
      router: {
        push: (href) => routerPushes.push(href),
        replace: () => undefined,
      },
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      deps,
    });

    expect(deps.toastSuccesses).toEqual([]);
    expect(deps.toastErrors).toHaveLength(1);
    expect(deps.toastErrors[0].message).toContain("주문번호");
    expect(routerPushes).toEqual([]);
    expect(deps.routerCalls).toEqual([]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("stops payment submission when payment config is missing", async () => {
    const setSubmittingCalls: boolean[] = [];
    const notices: Array<PaymentNotice | null> = [];
    const deps = buildDeps({
      requestPreparedOrderPayment: async () => {
        throw new Error("should not be called");
      },
    });

    await submitPaymentOrder({
      orderBody: { od_name: "Buyer" },
      paymentConfig: null,
      methodDef: paymentMethod(),
      origin: "https://example.com",
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      setPaymentNotice: (notice) => notices.push(notice),
      deps,
    });

    expect(deps.toastErrors).toHaveLength(1);
    expect(notices).toEqual([]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("stops payment submission when pg method is missing", async () => {
    const setSubmittingCalls: boolean[] = [];
    const deps = buildDeps({
      requestPreparedOrderPayment: async () => {
        throw new Error("should not be called");
      },
    });

    await submitPaymentOrder({
      orderBody: { od_name: "Buyer" },
      paymentConfig: paymentConfig(),
      methodDef: paymentMethod({ pg_method: undefined }),
      origin: "https://example.com",
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      setPaymentNotice: () => undefined,
      deps,
    });

    expect(deps.toastErrors).toHaveLength(1);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("starts prepared payment submission with a preparing notice", async () => {
    const notices: Array<PaymentNotice | null> = [];
    const setSubmittingCalls: boolean[] = [];
    const orderBody: OrderBody = { od_name: "Buyer" };
    const config = paymentConfig();
    const methodDef = paymentMethod();
    const progressNotice: PaymentNotice = {
      tone: "info",
      title: "Progress",
      message: "Continue",
    };
    const deps = buildDeps({
      requestPreparedOrderPayment: async (input) => {
        expect(input.orderBody).toBe(orderBody);
        expect(input.paymentConfig).toBe(config);
        expect(input.methodDef).toBe(methodDef);
        expect(input.origin).toBe("https://example.com");
        input.onPaymentProgress(progressNotice);
      },
    });

    await submitPaymentOrder({
      orderBody,
      paymentConfig: config,
      methodDef,
      origin: "https://example.com",
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      setPaymentNotice: (notice) => notices.push(notice),
      deps,
    });

    expect(notices).toEqual([PAYMENT_PREPARING_NOTICE, progressNotice]);
    expect(deps.toastErrors).toEqual([]);
    expect(setSubmittingCalls).toEqual([]);
  });

  test("reloads the shown rows when the cart changed before the payment window", async () => {
    const notices: Array<PaymentNotice | null> = [];
    const setSubmittingCalls: boolean[] = [];
    let reloads = 0;
    const deps = buildDeps({
      requestPreparedOrderPayment: async () => {
        throw Object.assign(new Error("장바구니가 바뀌었습니다."), { code: "CART_CHANGED" });
      },
    });

    await submitPaymentOrder({
      orderBody: { od_name: "Buyer", ct_ids: "1,2" },
      paymentConfig: paymentConfig(),
      methodDef: paymentMethod(),
      origin: "https://example.com",
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      setPaymentNotice: (notice) => notices.push(notice),
      onCartChanged: () => {
        reloads += 1;
      },
      deps,
    });

    expect(reloads).toBe(1);
    // 준비 중 안내를 걷는다 — 결제창은 열리지 않았다.
    expect(notices).toEqual([PAYMENT_PREPARING_NOTICE, null]);
    expect(deps.toastErrors).toEqual([
      { message: CART_CHANGED_MESSAGE, duration: PAYMENT_NOTICE_AUTO_DISMISS_MS },
    ]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("reloads the hope date rule when payment prepare rejects the hope date", async () => {
    const notices: Array<PaymentNotice | null> = [];
    const setSubmittingCalls: boolean[] = [];
    let reloads = 0;
    const deps = buildDeps({
      requestPreparedOrderPayment: async () => {
        throw Object.assign(new Error("희망배송일을 선택하여 주십시오."), { code: "HOPE_DATE" });
      },
    });

    await submitPaymentOrder({
      orderBody: { od_name: "Buyer", ct_ids: "1,2" },
      paymentConfig: paymentConfig(),
      methodDef: paymentMethod(),
      origin: "https://example.com",
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      setPaymentNotice: (notice) => notices.push(notice),
      onHopeDateRejected: () => {
        reloads += 1;
      },
      deps,
    });

    expect(reloads).toBe(1);
    expect(notices).toEqual([PAYMENT_PREPARING_NOTICE, null]);
    expect(deps.toastErrors).toEqual([
      { message: "희망배송일을 선택하여 주십시오.", duration: PAYMENT_NOTICE_AUTO_DISMISS_MS },
    ]);
    expect(setSubmittingCalls).toEqual([false]);
  });

  test("reports prepared payment failures and clears submitting state", async () => {
    const notices: Array<PaymentNotice | null> = [];
    const setSubmittingCalls: boolean[] = [];
    const deps = buildDeps({
      requestPreparedOrderPayment: async () => {
        throw new Error("payment failed");
      },
    });

    await submitPaymentOrder({
      orderBody: { od_name: "Buyer" },
      paymentConfig: paymentConfig(),
      methodDef: paymentMethod(),
      origin: "https://example.com",
      setSubmitting: (submitting) => setSubmittingCalls.push(submitting),
      setPaymentNotice: (notice) => notices.push(notice),
      deps,
    });

    expect(notices[0]).toBe(PAYMENT_PREPARING_NOTICE);
    // 영어 오류 문구는 화면에 한국어로 낸다(src/lib/api-error-messages.ts).
    expect(notices[1]).toMatchObject({
      tone: "error",
      message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    });
    expect(deps.toastErrors).toEqual([
      {
        message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
        duration: PAYMENT_NOTICE_AUTO_DISMISS_MS,
      },
    ]);
    expect(setSubmittingCalls).toEqual([false]);
  });
});
