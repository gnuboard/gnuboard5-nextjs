import { expect, test } from "@playwright/test";
import type { PreparedOrder } from "../src/lib/payment";
import {
  normalizePaymentAmount,
  paymentMessageOrigins,
  paymentTaxAmounts,
  postPaymentResult,
  urlOrigin,
} from "../src/lib/payment.shared";

function preparedOrder(overrides: Partial<PreparedOrder> = {}): PreparedOrder {
  return {
    order_id: "order-1",
    order_name: "Test order",
    amount: 10000,
    buyer_name: "Buyer",
    buyer_email: "buyer@example.com",
    buyer_tel: "010-1234-5678",
    ...overrides,
  };
}

type TestWindow = {
  location: {
    origin: string;
  };
  __G5_NEXTJS25_CONFIG__?: {
    apiBaseUrl?: string;
  };
  postMessage?: (message: unknown, targetOrigin: string) => void;
};

function withWindow<T>(windowLike: TestWindow, callback: () => T): T {
  const hadWindow = "window" in globalThis;
  const previousWindow = (globalThis as typeof globalThis & { window?: Window })
    .window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowLike as unknown as Window,
  });

  try {
    return callback();
  } finally {
    if (hadWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

test.describe("payment shared helpers", () => {
  test("normalizes payment amounts to non-negative integers", () => {
    expect(normalizePaymentAmount("12000.9")).toBe(12000);
    expect(normalizePaymentAmount(3000.8)).toBe(3000);
    expect(normalizePaymentAmount(-100)).toBe(0);
    expect(normalizePaymentAmount(Number.NaN)).toBe(0);
    expect(normalizePaymentAmount(undefined)).toBe(0);
  });

  test("calculates payment tax amounts only when tax flag is enabled", () => {
    expect(
      paymentTaxAmounts(
        preparedOrder({
          tax_flag: 1,
          comm_tax_mny: 7000,
          comm_vat_mny: 700,
          comm_free_mny: 3000,
        })
      )
    ).toEqual({
      enabled: true,
      tax: 7000,
      vat: 700,
      free: 3000,
      supply: 10000,
    });

    expect(
      paymentTaxAmounts(
        preparedOrder({
          tax_flag: 0,
          comm_tax_mny: 7000,
          comm_vat_mny: 700,
          comm_free_mny: 3000,
        })
      )
    ).toEqual({
      enabled: false,
      tax: 0,
      vat: 0,
      free: 0,
      supply: 0,
    });
  });

  test("resolves URL origins relative to the current window", () => {
    withWindow(
      {
        location: {
          origin: "https://shop.example.com",
        },
      },
      () => {
        expect(urlOrigin("/shop/payment/success")).toBe(
          "https://shop.example.com"
        );
        expect(urlOrigin("https://pg.example.com/pay")).toBe(
          "https://pg.example.com"
        );
        expect(urlOrigin("http://[bad")).toBe("");
        expect(urlOrigin(undefined)).toBe("");
      }
    );
  });

  test("collects trusted payment message origins from runtime config and URLs", () => {
    withWindow(
      {
        location: {
          origin: "https://shop.example.com",
        },
        __G5_NEXTJS25_CONFIG__: {
          apiBaseUrl: "https://api.example.com/api/v1",
        },
      },
      () => {
        expect(
          Array.from(
            paymentMessageOrigins(
              "https://pg.example.com/return",
              "/relative/callback",
              undefined
            )
          ).sort()
        ).toEqual(
          [
            "https://api.example.com",
            "https://pg.example.com",
            "https://shop.example.com",
          ].sort()
        );
      }
    );
  });

  test("posts normalized payment result messages to the current window origin", () => {
    const posted: Array<{ message: unknown; targetOrigin: string }> = [];

    withWindow(
      {
        location: {
          origin: "https://shop.example.com",
        },
        postMessage: (message, targetOrigin) => {
          posted.push({ message, targetOrigin });
        },
      },
      () => {
        postPaymentResult({
          status: "success",
          orderId: "order-1",
        });
        postPaymentResult({
          status: "cancelled",
          message: "cancelled by user",
        });
      }
    );

    expect(posted).toEqual([
      {
        message: {
          type: "shop-payment-result",
          status: "success",
          orderId: "order-1",
        },
        targetOrigin: "https://shop.example.com",
      },
      {
        message: {
          type: "shop-payment-result",
          status: "cancelled",
          message: "cancelled by user",
        },
        targetOrigin: "https://shop.example.com",
      },
    ]);
  });
});
